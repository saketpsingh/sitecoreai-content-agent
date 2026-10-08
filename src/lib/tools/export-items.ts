import { z } from 'zod';
import { ToolDefinition, ToolResult, AgentState } from '@/types/agent';
import { SitecoreClient } from '@/lib/sitecore-client';

const InputSchema = z.object({
  itemIds: z.array(z.string()),
  includeDescendants: z.boolean().default(true),
});

export interface ExportResult {
  packageId: string;
  totalItems: number;
  totalChunks: number;
  chunks: Array<{ index: number; sizeBytes: number; checksum: string }>;
  exportedAt: string;
}

export async function executeExportItems(
  input: unknown,
  state: AgentState,
  client: SitecoreClient
): Promise<ToolResult> {
  try {
    const parsed = InputSchema.parse(input);
    if (parsed.itemIds.length === 0) {
      return { toolCallId: '', success: false, error: 'No items specified' };
    }

    const { packageId, chunks } = await client.exportItems(parsed.itemIds);

    const result: ExportResult = {
      packageId,
      totalItems: parsed.itemIds.length,
      totalChunks: chunks.length,
      chunks: chunks.map((chunk, i) => ({ index: i, sizeBytes: chunk.size, checksum: `checksum-${i}` })),
      exportedAt: new Date().toISOString(),
    };

    state.memory.successfulTransfers.push(...parsed.itemIds);
    return { toolCallId: '', success: true, data: result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Export error';
    if (msg.includes('timeout')) return { toolCallId: '', success: false, error: `Export timed out. Reduce batch size. ${msg}` };
    if (msg.includes('401') || msg.includes('403')) return { toolCallId: '', success: false, error: `Auth failed. ${msg}` };
    return { toolCallId: '', success: false, error: msg };
  }
}

export const exportItemsTool: ToolDefinition = {
  name: 'export_items',
  description: 'Export items using Item Transfer API',
  inputSchema: InputSchema,
  execute: async () => { throw new Error('Client must be injected'); },
};
