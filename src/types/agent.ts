import { z } from 'zod';

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface AgentState {
  sessionId: string;
  messages: AgentMessage[];
  currentOperation: string | null;
  retryCount: number;
  maxRetries: number;
  memory: AgentMemory;
}

export interface AgentMemory {
  templateMappings: Record<string, string>;
  successfulTransfers: string[];
  failedItems: Array<{ itemId: string; reason: string }>;
  environmentQuirks: Record<string, string[]>;
  learnedPatterns: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  execute: (input: unknown, state: AgentState) => Promise<ToolResult>;
}

export const AgentDecisionSchema = z.object({
  action: z.enum([
    'analyze_dependencies',
    'validate_content',
    'export_items',
    'import_items',
    'request_human_approval',
    'escalate',
    'complete',
  ]),
  reasoning: z.string(),
  parameters: z.record(z.unknown()).optional(),
});

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

export interface EscalationContext {
  sessionId: string;
  attemptedOperations: string[];
  errors: Array<{ operation: string; error: string; timestamp: string }>;
  partialProgress: {
    itemsAnalyzed: number;
    itemsValidated: number;
    itemsTransferred: number;
  };
  recommendation: string;
}
