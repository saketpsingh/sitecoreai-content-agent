import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { SitecoreClient } from '@/lib/sitecore-client';
import { executeAnalyzeDependencies } from '@/lib/tools/analyze-dependencies';
import { executeValidateContent } from '@/lib/tools/validate-content';
import { executeExportItems } from '@/lib/tools/export-items';
import { executeImportItems } from '@/lib/tools/import-items';
import { initializeMemory } from '@/lib/memory';
import { logTrace } from '@/lib/observability';

export interface AgentState {
  messages: BaseMessage[];
  sessionId: string;
  sourceEnv: string;
  targetEnv: string;
  itemPaths: string[];
  status: 'analyzing' | 'validating' | 'awaiting_approval' | 'exporting' | 'importing' | 'completed' | 'failed' | 'escalated';
  retryCount: number;
  analysis?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  exportData?: Record<string, unknown>;
  humanApproval?: { approved: boolean; approvedBy: string; approvedAt: string };
  errors: Array<{ operation: string; message: string; timestamp: string }>;
}

const MAX_RETRIES = 3;

function createTools(sourceClient: SitecoreClient, targetClient: SitecoreClient) {
  const memory = initializeMemory();
  const agentState = {
    sessionId: '',
    messages: [],
    currentOperation: null,
    retryCount: 0,
    maxRetries: MAX_RETRIES,
    memory,
  };

  const analyzeDependenciesTool = new DynamicStructuredTool({
    name: 'analyze_dependencies',
    description: 'Analyze Sitecore item dependencies to find broken refs and determine transfer order. Use this FIRST.',
    schema: z.object({
      itemPath: z.string().describe('Sitecore item path to analyze'),
      includeDescendants: z.boolean().default(true),
      maxDepth: z.number().default(10),
    }),
    func: async (input) => {
      const result = await executeAnalyzeDependencies(input, agentState, sourceClient);
      return JSON.stringify(result);
    },
  });

  const validateContentTool = new DynamicStructuredTool({
    name: 'validate_content',
    description: 'Validate items against XM Cloud schema before transfer. Use after analyze_dependencies.',
    schema: z.object({
      items: z.array(z.record(z.unknown())).describe('Items to validate'),
      targetEnvironment: z.string(),
      strictMode: z.boolean().default(false),
    }),
    func: async (input) => {
      const result = await executeValidateContent(input, agentState, targetClient);
      return JSON.stringify(result);
    },
  });

  const exportItemsTool = new DynamicStructuredTool({
    name: 'export_items',
    description: 'Export items from source environment using Item Transfer API.',
    schema: z.object({
      itemIds: z.array(z.string()).describe('Item IDs to export'),
      includeDescendants: z.boolean().default(true),
    }),
    func: async (input) => {
      const result = await executeExportItems(input, agentState, sourceClient);
      return JSON.stringify(result);
    },
  });

  const importItemsTool = new DynamicStructuredTool({
    name: 'import_items',
    description: 'Import items to target environment. REQUIRES human approval first.',
    schema: z.object({
      packageId: z.string(),
      chunks: z.array(z.record(z.unknown())),
      conflictResolution: z.enum(['overwrite', 'skip', 'fail']).default('overwrite'),
      dryRun: z.boolean().default(false),
    }),
    func: async (input) => {
      const result = await executeImportItems(input, agentState, targetClient, []);
      return JSON.stringify(result);
    },
  });

  const requestApprovalTool = new DynamicStructuredTool({
    name: 'request_human_approval',
    description: 'Request human approval before irreversible import. MANDATORY before import_items.',
    schema: z.object({
      reason: z.string(),
      itemCount: z.number(),
      warnings: z.array(z.string()).default([]),
    }),
    func: async (input) => {
      return JSON.stringify({ status: 'awaiting_approval', ...input });
    },
  });

  const escalateTool = new DynamicStructuredTool({
    name: 'escalate',
    description: 'Escalate to human after repeated failures. Use after 3 failed attempts.',
    schema: z.object({
      reason: z.string(),
      attemptedActions: z.array(z.string()),
      recommendation: z.string(),
    }),
    func: async (input) => {
      return JSON.stringify({ status: 'escalated', ...input });
    },
  });

  return [
    analyzeDependenciesTool,
    validateContentTool,
    exportItemsTool,
    importItemsTool,
    requestApprovalTool,
    escalateTool,
  ];
}

async function callModel(state: AgentState): Promise<Partial<AgentState>> {
  const baseUrl = process.env.PORTKEY_GATEWAY_URL || 'https://portkeygateway.perficient.com/v1';
  const apiKey = process.env.PORTKEY_API_KEY || '';
  const provider = process.env.PORTKEY_PROVIDER || '@aws-bedrock-use2';
  const model = process.env.ANTHROPIC_MODEL || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

  logTrace({ sessionId: state.sessionId, operation: 'call_model', status: 'started' });

  const systemPrompt = `You are a Sitecore XM Cloud content transfer agent.

WORKFLOW:
1. analyze_dependencies - understand what to transfer
2. validate_content - check for issues
3. request_human_approval - MANDATORY before import
4. export_items - export from source
5. import_items - import to target (only after approval)
6. escalate - if 3+ failures occur

Current request: Transfer from ${state.sourceEnv} to ${state.targetEnv}
Items: ${state.itemPaths.join(', ')}`;

  const messages = state.messages.map(m => {
    if (m instanceof HumanMessage) return { role: 'user', content: m.content };
    if (m instanceof AIMessage) return { role: 'assistant', content: m.content };
    if (m instanceof ToolMessage) return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }] };
    return { role: 'user', content: String(m.content) };
  });

  const tools = [
    { name: 'analyze_dependencies', description: 'Analyze dependencies', input_schema: { type: 'object', properties: { itemPath: { type: 'string' }, includeDescendants: { type: 'boolean' }, maxDepth: { type: 'number' } }, required: ['itemPath'] } },
    { name: 'validate_content', description: 'Validate content', input_schema: { type: 'object', properties: { items: { type: 'array' }, targetEnvironment: { type: 'string' }, strictMode: { type: 'boolean' } }, required: ['items', 'targetEnvironment'] } },
    { name: 'export_items', description: 'Export items', input_schema: { type: 'object', properties: { itemIds: { type: 'array' }, includeDescendants: { type: 'boolean' } }, required: ['itemIds'] } },
    { name: 'import_items', description: 'Import items', input_schema: { type: 'object', properties: { packageId: { type: 'string' }, chunks: { type: 'array' }, conflictResolution: { type: 'string' }, dryRun: { type: 'boolean' } }, required: ['packageId', 'chunks'] } },
    { name: 'request_human_approval', description: 'Request approval', input_schema: { type: 'object', properties: { reason: { type: 'string' }, itemCount: { type: 'number' }, warnings: { type: 'array' } }, required: ['reason', 'itemCount'] } },
    { name: 'escalate', description: 'Escalate to human', input_schema: { type: 'object', properties: { reason: { type: 'string' }, attemptedActions: { type: 'array' }, recommendation: { type: 'string' } }, required: ['reason', 'attemptedActions', 'recommendation'] } },
  ];

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
      messages,
      tools,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logTrace({ sessionId: state.sessionId, operation: 'call_model', status: 'failed', error });
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  logTrace({ sessionId: state.sessionId, operation: 'call_model', status: 'completed' });

  const aiMessage = new AIMessage({ content: data.content });
  return { messages: [...state.messages, aiMessage] };
}

function shouldContinue(state: AgentState): 'tools' | 'end' | 'await_approval' {
  const lastMessage = state.messages[state.messages.length - 1];

  if (state.status === 'awaiting_approval') return 'await_approval';
  if (state.status === 'completed' || state.status === 'escalated' || state.status === 'failed') return 'end';

  if (lastMessage instanceof AIMessage) {
    const content = lastMessage.content;
    if (Array.isArray(content)) {
      const hasToolUse = content.some((block: unknown) =>
        typeof block === 'object' && block !== null && 'type' in block && (block as { type: string }).type === 'tool_use'
      );
      if (hasToolUse) return 'tools';
    }
  }

  return 'end';
}

async function processTools(state: AgentState, sourceClient: SitecoreClient, targetClient: SitecoreClient): Promise<Partial<AgentState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  if (!(lastMessage instanceof AIMessage)) return state;

  const content = lastMessage.content;
  if (!Array.isArray(content)) return state;

  const toolResults: BaseMessage[] = [];
  let newStatus = state.status;
  let analysis = state.analysis;
  let validation = state.validation;
  let exportData = state.exportData;
  const errors = [...state.errors];
  let retryCount = state.retryCount;

  const tools = createTools(sourceClient, targetClient);

  for (const block of content) {
    if (typeof block === 'object' && block !== null && 'type' in block && (block as { type: string }).type === 'tool_use') {
      const toolUse = block as { id: string; name: string; input: Record<string, unknown> };
      const tool = tools.find(t => t.name === toolUse.name);

      logTrace({ sessionId: state.sessionId, operation: `tool_${toolUse.name}`, status: 'started' });

      try {
        if (tool) {
          // Type assertion needed: toolUse.input is validated at runtime by Zod in each tool
          const result = await (tool.func as (input: unknown) => Promise<string>)(toolUse.input);
          const parsed = JSON.parse(result);

          if (toolUse.name === 'analyze_dependencies') analysis = parsed;
          if (toolUse.name === 'validate_content') validation = parsed;
          if (toolUse.name === 'export_items') exportData = parsed;
          if (toolUse.name === 'request_human_approval') newStatus = 'awaiting_approval';
          if (toolUse.name === 'escalate') newStatus = 'escalated';

          toolResults.push(new ToolMessage({ content: result, tool_call_id: toolUse.id }));
          logTrace({ sessionId: state.sessionId, operation: `tool_${toolUse.name}`, status: 'completed' });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ operation: toolUse.name, message: errorMsg, timestamp: new Date().toISOString() });
        retryCount++;

        if (retryCount >= MAX_RETRIES) {
          newStatus = 'escalated';
        }

        toolResults.push(new ToolMessage({ content: JSON.stringify({ error: errorMsg }), tool_call_id: toolUse.id }));
        logTrace({ sessionId: state.sessionId, operation: `tool_${toolUse.name}`, status: 'failed', error: errorMsg });
      }
    }
  }

  return {
    messages: [...state.messages, ...toolResults],
    status: newStatus,
    analysis,
    validation,
    exportData,
    errors,
    retryCount,
  };
}

export async function runTransferAgent(
  sourceClient: SitecoreClient,
  targetClient: SitecoreClient,
  sessionId: string,
  sourceEnv: string,
  targetEnv: string,
  itemPaths: string[]
): Promise<AgentState> {
  let state: AgentState = {
    messages: [new HumanMessage(`Transfer items: ${itemPaths.join(', ')}`)],
    sessionId,
    sourceEnv,
    targetEnv,
    itemPaths,
    status: 'analyzing',
    retryCount: 0,
    errors: [],
  };

  const maxIterations = 10;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const modelUpdate = await callModel(state);
    state = { ...state, ...modelUpdate };

    const decision = shouldContinue(state);

    if (decision === 'end' || decision === 'await_approval') {
      break;
    }

    if (decision === 'tools') {
      const toolsUpdate = await processTools(state, sourceClient, targetClient);
      state = { ...state, ...toolsUpdate };
    }
  }

  return state;
}
