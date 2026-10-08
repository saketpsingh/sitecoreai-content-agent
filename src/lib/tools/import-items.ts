import { z } from 'zod';
import { ToolDefinition, ToolResult, AgentState } from '@/types/agent';
import { TransferResult } from '@/types/sitecore';
import { SitecoreClient } from '@/lib/sitecore-client';

const InputSchema = z.object({
  packageId: z.string(),
  chunks: z.array(z.object({ index: z.number(), sizeBytes: z.number(), checksum: z.string() })),
  conflictResolution: z.enum(['overwrite', 'skip', 'fail']).default('overwrite'),
  dryRun: z.boolean().default(false),
});

export async function executeImportItems(
  input: unknown,
  _state: AgentState,
  client: SitecoreClient,
  packageData: Blob[]
): Promise<ToolResult> {
  try {
    const parsed = InputSchema.parse(input);

    if (parsed.dryRun) {
      return {
        toolCallId: '',
        success: true,
        data: { dryRun: true, message: `Would import ${parsed.chunks.length} chunks`, estimatedItems: parsed.chunks.length * 10 },
      };
    }

    const importResult = await client.importItems(packageData);

    const result: TransferResult = {
      success: importResult.success,
      itemsTransferred: importResult.itemsImported,
      itemsFailed: importResult.errors.length,
      details: importResult.errors.map((err, i) => ({ itemId: `err-${i}`, itemPath: 'unknown', status: 'failed' as const, error: err })),
      chunksProcessed: parsed.chunks.length,
      totalChunks: parsed.chunks.length,
    };

    if (!importResult.success) {
      return { toolCallId: '', success: false, error: `Import errors: ${importResult.errors.slice(0, 3).join('; ')}`, data: result };
    }
    return { toolCallId: '', success: true, data: result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Import error';
    if (msg.includes('timeout')) return { toolCallId: '', success: false, error: `Import timed out. ${msg}` };
    if (msg.includes('conflict')) return { toolCallId: '', success: false, error: `Conflict detected. Use skip/overwrite. ${msg}` };
    return { toolCallId: '', success: false, error: msg };
  }
}

export const importItemsTool: ToolDefinition = {
  name: 'import_items',
  description: 'Import items using Content Transfer API. REQUIRES human approval.',
  inputSchema: InputSchema,
  execute: async () => { throw new Error('Client must be injected'); },
};
