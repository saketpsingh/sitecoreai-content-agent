import { AgentMemory } from '@/types/agent';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = './.agent-memory';
const MEMORY_FILE = 'transfer-memory.json';

export function initializeMemory(): AgentMemory {
  return {
    templateMappings: {},
    successfulTransfers: [],
    failedItems: [],
    environmentQuirks: {},
    learnedPatterns: [],
  };
}

export function loadMemory(): AgentMemory {
  try {
    const filePath = join(MEMORY_DIR, MEMORY_FILE);
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as AgentMemory;
    }
  } catch (error) {
    console.warn('Failed to load memory, starting fresh:', error);
  }
  return initializeMemory();
}

export function saveMemory(memory: AgentMemory): void {
  try {
    if (!existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true });
    }
    const filePath = join(MEMORY_DIR, MEMORY_FILE);
    writeFileSync(filePath, JSON.stringify(memory, null, 2));
  } catch (error) {
    console.error('Failed to save memory:', error);
  }
}

export function updateMemory(
  memory: AgentMemory,
  update: Partial<AgentMemory>
): AgentMemory {
  const updated = {
    ...memory,
    ...update,
    templateMappings: { ...memory.templateMappings, ...update.templateMappings },
    successfulTransfers: [
      ...new Set([...memory.successfulTransfers, ...(update.successfulTransfers || [])]),
    ],
    failedItems: [...memory.failedItems, ...(update.failedItems || [])],
    environmentQuirks: { ...memory.environmentQuirks, ...update.environmentQuirks },
    learnedPatterns: [
      ...new Set([...memory.learnedPatterns, ...(update.learnedPatterns || [])]),
    ],
  };
  saveMemory(updated);
  return updated;
}

export function recordSuccess(memory: AgentMemory, itemIds: string[]): AgentMemory {
  return updateMemory(memory, {
    successfulTransfers: itemIds,
  });
}

export function recordFailure(
  memory: AgentMemory,
  itemId: string,
  reason: string
): AgentMemory {
  return updateMemory(memory, {
    failedItems: [{ itemId, reason }],
  });
}

export function recordPattern(memory: AgentMemory, pattern: string): AgentMemory {
  return updateMemory(memory, {
    learnedPatterns: [pattern],
  });
}

export function recordEnvironmentQuirk(
  memory: AgentMemory,
  envName: string,
  quirk: string
): AgentMemory {
  const existing = memory.environmentQuirks[envName] || [];
  return updateMemory(memory, {
    environmentQuirks: {
      [envName]: [...new Set([...existing, quirk])],
    },
  });
}

export function getRelevantContext(memory: AgentMemory): string {
  const lines: string[] = [];

  if (memory.successfulTransfers.length > 0) {
    lines.push(`Previously transferred ${memory.successfulTransfers.length} items successfully.`);
  }

  if (memory.failedItems.length > 0) {
    const recentFailures = memory.failedItems.slice(-5);
    lines.push(`Recent failures: ${recentFailures.map(f => `${f.itemId}: ${f.reason}`).join('; ')}`);
  }

  if (memory.learnedPatterns.length > 0) {
    lines.push(`Learned patterns: ${memory.learnedPatterns.join('; ')}`);
  }

  for (const [env, quirks] of Object.entries(memory.environmentQuirks)) {
    if (quirks.length > 0) {
      lines.push(`${env} environment notes: ${quirks.join('; ')}`);
    }
  }

  return lines.join('\n');
}
