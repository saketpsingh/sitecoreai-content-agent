import { AgentState, ToolResult, EscalationContext } from '@/types/agent';
import { TransferSession, DependencyAnalysis, ValidationResult } from '@/types/sitecore';
import { SitecoreClient } from './sitecore-client';
import { loadMemory, saveMemory, getRelevantContext } from './memory';
import { executeAnalyzeDependencies } from './tools/analyze-dependencies';
import { executeValidateContent } from './tools/validate-content';
import { executeExportItems } from './tools/export-items';
import { executeImportItems } from './tools/import-items';

const MAX_RETRIES = 3;

function generateId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'analyze_dependencies',
    description: 'Analyze Sitecore item dependencies, find broken refs, determine transfer order',
    input_schema: {
      type: 'object',
      properties: {
        itemPath: { type: 'string', description: 'Sitecore item path to analyze' },
        includeDescendants: { type: 'boolean' },
        maxDepth: { type: 'number' },
      },
      required: ['itemPath'],
    },
  },
  {
    name: 'validate_content',
    description: 'Validate items against XM Cloud schema before transfer',
    input_schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
        targetEnvironment: { type: 'string' },
        strictMode: { type: 'boolean' },
      },
      required: ['items', 'targetEnvironment'],
    },
  },
  {
    name: 'export_items',
    description: 'Export items from source using Item Transfer API',
    input_schema: {
      type: 'object',
      properties: {
        itemIds: { type: 'array', items: { type: 'string' } },
        includeDescendants: { type: 'boolean' },
      },
      required: ['itemIds'],
    },
  },
  {
    name: 'import_items',
    description: 'Import items to target using Content Transfer API. REQUIRES human approval.',
    input_schema: {
      type: 'object',
      properties: {
        packageId: { type: 'string' },
        chunks: { type: 'array' },
        conflictResolution: { type: 'string', enum: ['overwrite', 'skip', 'fail'] },
        dryRun: { type: 'boolean' },
      },
      required: ['packageId', 'chunks'],
    },
  },
  {
    name: 'request_human_approval',
    description: 'Request human approval before irreversible import operation',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        itemCount: { type: 'number' },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      required: ['reason', 'itemCount'],
    },
  },
  {
    name: 'escalate',
    description: 'Escalate to human after repeated failures',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        attemptedActions: { type: 'array', items: { type: 'string' } },
        recommendation: { type: 'string' },
      },
      required: ['reason', 'attemptedActions', 'recommendation'],
    },
  },
];

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: string;
}

async function callPortkeyGateway(
  messages: Message[],
  systemPrompt: string,
  tools: ToolDefinition[]
): Promise<AnthropicResponse> {
  const baseUrl = process.env.PORTKEY_GATEWAY_URL || 'https://portkeygateway.perficient.com/v1';
  const apiKey = process.env.PORTKEY_API_KEY || '';
  const provider = process.env.PORTKEY_PROVIDER || '@aws-bedrock-use2';
  const model = process.env.ANTHROPIC_MODEL || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-portkey-api-key': apiKey,
      'x-portkey-provider': provider,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Portkey API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

export class TransferAgent {
  private sourceClient: SitecoreClient;
  private targetClient: SitecoreClient;
  private state: AgentState;
  private session: TransferSession;
  private exportedPackage: { packageId: string; chunks: Blob[] } | null = null;

  constructor(
    sourceClient: SitecoreClient,
    targetClient: SitecoreClient,
    session: TransferSession
  ) {
    this.sourceClient = sourceClient;
    this.targetClient = targetClient;
    this.session = session;
    this.state = {
      sessionId: session.id,
      messages: [],
      currentOperation: null,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      memory: loadMemory(),
    };
  }

  private getSystemPrompt(): string {
    const memoryContext = getRelevantContext(this.state.memory);
    return `You are a Sitecore XM Cloud content transfer agent. Your job is to safely transfer content between environments.

WORKFLOW:
1. First, analyze_dependencies to understand what needs to be transferred
2. Then, validate_content to check for issues
3. If validation passes, export_items from source
4. Request human_approval before any import (MANDATORY)
5. Only after approval, import_items to target
6. If errors occur 3 times, escalate with full context

RULES:
- NEVER import without human approval
- Always validate before export
- Include specific error details in retries
- Track broken references and warn about them

${memoryContext ? `CONTEXT FROM PREVIOUS SESSIONS:\n${memoryContext}` : ''}

Current transfer request:
- Source: ${this.session.request.sourceEnv}
- Target: ${this.session.request.targetEnv}
- Items: ${this.session.request.itemPaths.join(', ')}
- Include descendants: ${this.session.request.includeDescendants}
- Conflict resolution: ${this.session.request.conflictResolution}`;
  }

  async executeTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    this.state.currentOperation = name;

    try {
      switch (name) {
        case 'analyze_dependencies':
          return await executeAnalyzeDependencies(input, this.state, this.sourceClient);

        case 'validate_content':
          return await executeValidateContent(input, this.state, this.targetClient);

        case 'export_items':
          const exportResult = await executeExportItems(input, this.state, this.sourceClient);
          if (exportResult.success && exportResult.data) {
            const data = exportResult.data as { packageId: string };
            this.exportedPackage = { packageId: data.packageId, chunks: [] };
          }
          return exportResult;

        case 'import_items':
          if (!this.session.humanApproval?.approved) {
            return {
              toolCallId: '',
              success: false,
              error: 'Human approval required before import. Call request_human_approval first.',
            };
          }
          return await executeImportItems(
            input,
            this.state,
            this.targetClient,
            this.exportedPackage?.chunks || []
          );

        case 'request_human_approval':
          return {
            toolCallId: '',
            success: true,
            data: { status: 'awaiting_approval', sessionId: this.session.id },
          };

        case 'escalate':
          const escalation: EscalationContext = {
            sessionId: this.session.id,
            attemptedOperations: (input.attemptedActions as string[]) || [],
            errors: this.session.errors.map(e => ({ operation: e.operation, error: e.message, timestamp: e.timestamp })),
            partialProgress: {
              itemsAnalyzed: this.session.analysis?.dependencies.length || 0,
              itemsValidated: this.session.validation?.length || 0,
              itemsTransferred: this.session.result?.itemsTransferred || 0,
            },
            recommendation: (input.recommendation as string) || 'Manual intervention required',
          };
          this.session.status = 'escalated';
          return { toolCallId: '', success: true, data: escalation };

        default:
          return { toolCallId: '', success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.session.errors.push({
        timestamp: new Date().toISOString(),
        operation: name,
        message: errorMsg,
        retryCount: this.state.retryCount,
      });

      this.state.retryCount++;
      if (this.state.retryCount >= MAX_RETRIES) {
        return {
          toolCallId: '',
          success: false,
          error: `Failed after ${MAX_RETRIES} attempts. Last error: ${errorMsg}. Please escalate.`,
        };
      }

      return {
        toolCallId: '',
        success: false,
        error: `${errorMsg}. Retry ${this.state.retryCount}/${MAX_RETRIES}. Adjust approach and try again.`,
      };
    }
  }

  async run(): Promise<TransferSession> {
    this.session.status = 'analyzing';
    const userMessage = `Please transfer the following items: ${this.session.request.itemPaths.join(', ')}`;

    const messages: Message[] = [
      { role: 'user', content: userMessage }
    ];

    const isTerminalStatus = () => {
      const status = this.session.status;
      return status === 'completed' || status === 'escalated' || status === 'failed';
    };

    while (!isTerminalStatus()) {
      const response = await callPortkeyGateway(messages, this.getSystemPrompt(), TOOLS);

      const toolUseBlocks = response.content.filter(
        (block): block is ContentBlock & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
          block.type === 'tool_use'
      );

      if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
        const toolResults: ContentBlock[] = [];

        for (const toolUse of toolUseBlocks) {
          const result = await this.executeTool(toolUse.name, toolUse.input);
          result.toolCallId = toolUse.id;

          if (toolUse.name === 'analyze_dependencies' && result.success) {
            this.session.analysis = result.data as DependencyAnalysis;
          }
          if (toolUse.name === 'validate_content' && result.success) {
            this.session.validation = (result.data as { results: ValidationResult[] }).results;
          }
          if (toolUse.name === 'request_human_approval') {
            this.session.status = 'awaiting_approval';
            saveMemory(this.state.memory);
            return this.session;
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result.success ? result.data : { error: result.error }),
          });
        }

        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
      } else {
        this.session.status = 'completed';
        break;
      }
    }

    saveMemory(this.state.memory);
    this.session.updatedAt = new Date().toISOString();
    return this.session;
  }

  async continueAfterApproval(approved: boolean, approvedBy: string, notes?: string): Promise<TransferSession> {
    this.session.humanApproval = {
      approved,
      approvedBy,
      approvedAt: new Date().toISOString(),
      notes,
    };

    if (!approved) {
      this.session.status = 'failed';
      return this.session;
    }

    this.session.status = 'transferring';
    return this.run();
  }
}

export function createSession(
  sourceEnv: string,
  targetEnv: string,
  itemPaths: string[],
  options: Partial<TransferSession['request']> = {}
): TransferSession {
  return {
    id: generateId(),
    request: {
      sourceEnv,
      targetEnv,
      itemPaths,
      includeDescendants: options.includeDescendants ?? true,
      includeDependencies: options.includeDependencies ?? true,
      conflictResolution: options.conflictResolution ?? 'overwrite',
    },
    status: 'analyzing',
    errors: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
