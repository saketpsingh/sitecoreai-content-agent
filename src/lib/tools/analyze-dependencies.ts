import { z } from 'zod';
import { ToolDefinition, ToolResult, AgentState } from '@/types/agent';
import { SitecoreItem, DependencyAnalysis } from '@/types/sitecore';
import { SitecoreClient } from '@/lib/sitecore-client';

const InputSchema = z.object({
  itemPath: z.string(),
  includeDescendants: z.boolean().default(true),
  maxDepth: z.number().default(10),
});

function extractReferences(item: SitecoreItem): string[] {
  const refs: string[] = [];
  const guidPattern = /\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?/gi;

  for (const [, value] of Object.entries(item.fields)) {
    if (typeof value === 'string') {
      const matches = value.match(guidPattern);
      if (matches) {
        refs.push(...matches.map(m => m.replace(/[{}]/g, '').toLowerCase()));
      }
    }
  }
  return [...new Set(refs)];
}

async function collectDependencies(
  client: SitecoreClient,
  rootItem: SitecoreItem,
  includeDescendants: boolean,
  maxDepth: number
): Promise<{
  items: SitecoreItem[];
  brokenRefs: Array<{ sourceItemId: string; fieldName: string; targetId: string; reason: string }>;
  circularRefs: Array<{ itemIds: string[]; path: string }>;
}> {
  const visited = new Set<string>();
  const items: SitecoreItem[] = [];
  const brokenRefs: Array<{ sourceItemId: string; fieldName: string; targetId: string; reason: string }> = [];

  async function traverse(item: SitecoreItem, depth: number): Promise<void> {
    if (depth > maxDepth || visited.has(item.id)) return;

    visited.add(item.id);
    items.push(item);

    const refs = extractReferences(item);
    for (const refId of refs) {
      if (visited.has(refId)) continue;
      try {
        const refItem = await client.getItem(refId);
        await traverse(refItem, depth + 1);
      } catch {
        brokenRefs.push({ sourceItemId: item.id, fieldName: 'unknown', targetId: refId, reason: 'Item not found' });
      }
    }

    if (includeDescendants) {
      try {
        const children = await client.getChildren(item.id);
        for (const child of children) await traverse(child, depth + 1);
      } catch { /* No children */ }
    }
  }

  await traverse(rootItem, 0);
  const circularRefs = detectCircularReferences(items);
  return { items, brokenRefs, circularRefs };
}

function detectCircularReferences(items: SitecoreItem[]): Array<{ itemIds: string[]; path: string }> {
  const circular: Array<{ itemIds: string[]; path: string }> = [];
  const itemMap = new Map(items.map(i => [i.id, i]));

  for (const item of items) {
    const refs = extractReferences(item);
    for (const refId of refs) {
      const refItem = itemMap.get(refId);
      if (refItem && extractReferences(refItem).includes(item.id)) {
        circular.push({ itemIds: [item.id, refId], path: `${item.path} <-> ${refItem.path}` });
      }
    }
  }
  return circular;
}

function computeTransferOrder(items: SitecoreItem[]): string[] {
  const itemMap = new Map(items.map(i => [i.id, i]));
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>();

  for (const item of items) {
    inDegree.set(item.id, 0);
    graph.set(item.id, []);
  }

  for (const item of items) {
    const refs = extractReferences(item);
    for (const refId of refs) {
      if (itemMap.has(refId)) {
        graph.get(refId)?.push(item.id);
        inDegree.set(item.id, (inDegree.get(item.id) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const dependent of graph.get(current) || []) {
      const newDegree = (inDegree.get(dependent) || 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  const remaining = items.filter(i => !order.includes(i.id)).map(i => i.id);
  return [...order, ...remaining];
}

export async function executeAnalyzeDependencies(
  input: unknown,
  state: AgentState,
  client: SitecoreClient
): Promise<ToolResult> {
  try {
    const parsed = InputSchema.parse(input);
    const rootItem = await client.getItem(parsed.itemPath);
    const { items, brokenRefs, circularRefs } = await collectDependencies(client, rootItem, parsed.includeDescendants, parsed.maxDepth);
    const transferOrder = computeTransferOrder(items);

    const analysis: DependencyAnalysis = {
      rootItem,
      dependencies: items.filter(i => i.id !== rootItem.id),
      mediaReferences: items.flatMap(i => extractReferences(i)).filter(ref => ref.includes('media')),
      brokenReferences: brokenRefs,
      circularReferences: circularRefs,
      transferOrder,
    };

    return { toolCallId: '', success: true, data: analysis };
  } catch (error) {
    return { toolCallId: '', success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export const analyzeDependenciesTool: ToolDefinition = {
  name: 'analyze_dependencies',
  description: 'Analyze Sitecore item dependencies and determine transfer order',
  inputSchema: InputSchema,
  execute: async (input, state) => { throw new Error('Client must be injected'); },
};
