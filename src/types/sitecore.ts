import { z } from 'zod';

export const SitecoreItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  path: z.string(),
  templateId: z.string().uuid(),
  templateName: z.string(),
  parentId: z.string().uuid().nullable(),
  language: z.string().default('en'),
  version: z.number().default(1),
  fields: z.record(z.string(), z.unknown()),
  created: z.string().datetime().optional(),
  updated: z.string().datetime().optional(),
});

export type SitecoreItem = z.infer<typeof SitecoreItemSchema>;

export const DependencyAnalysisSchema = z.object({
  rootItem: SitecoreItemSchema,
  dependencies: z.array(SitecoreItemSchema),
  mediaReferences: z.array(z.string()),
  brokenReferences: z.array(z.object({
    sourceItemId: z.string(),
    fieldName: z.string(),
    targetId: z.string(),
    reason: z.string(),
  })),
  circularReferences: z.array(z.object({
    itemIds: z.array(z.string()),
    path: z.string(),
  })),
  transferOrder: z.array(z.string()),
});

export type DependencyAnalysis = z.infer<typeof DependencyAnalysisSchema>;

export const ValidationResultSchema = z.object({
  itemId: z.string(),
  isValid: z.boolean(),
  errors: z.array(z.object({
    field: z.string(),
    message: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
  })),
  suggestions: z.array(z.string()),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const TransferResultSchema = z.object({
  success: z.boolean(),
  itemsTransferred: z.number(),
  itemsFailed: z.number(),
  details: z.array(z.object({
    itemId: z.string(),
    itemPath: z.string(),
    status: z.enum(['success', 'failed', 'skipped']),
    error: z.string().optional(),
  })),
  chunksProcessed: z.number(),
  totalChunks: z.number(),
});

export type TransferResult = z.infer<typeof TransferResultSchema>;

export const EnvironmentConfigSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  clientId: z.string(),
  clientSecret: z.string(),
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

export interface TransferRequest {
  sourceEnv: string;
  targetEnv: string;
  itemPaths: string[];
  includeDescendants: boolean;
  includeDependencies: boolean;
  conflictResolution: 'overwrite' | 'skip' | 'ask';
}

export interface TransferSession {
  id: string;
  request: TransferRequest;
  status: 'analyzing' | 'awaiting_approval' | 'transferring' | 'completed' | 'failed' | 'escalated';
  analysis?: DependencyAnalysis;
  validation?: ValidationResult[];
  result?: TransferResult;
  humanApproval?: {
    approved: boolean;
    approvedBy: string;
    approvedAt: string;
    notes?: string;
  };
  errors: Array<{
    timestamp: string;
    operation: string;
    message: string;
    retryCount: number;
  }>;
  createdAt: string;
  updatedAt: string;
}
