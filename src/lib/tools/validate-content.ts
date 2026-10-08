import { z } from 'zod';
import { ToolDefinition, ToolResult, AgentState } from '@/types/agent';
import { SitecoreItem, ValidationResult } from '@/types/sitecore';
import { SitecoreClient } from '@/lib/sitecore-client';

const InputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    templateId: z.string(),
    templateName: z.string(),
    parentId: z.string().nullable(),
    language: z.string(),
    version: z.number(),
    fields: z.record(z.unknown()),
  })),
  targetEnvironment: z.string(),
  strictMode: z.boolean().default(false),
});

interface ValidationContext {
  allItems: SitecoreItem[];
  strictMode: boolean;
}

const validationRules = [
  {
    name: 'required_title',
    severity: 'error' as const,
    check: (item: SitecoreItem) => {
      const title = item.fields['Title'] || item.fields['title'];
      if (!title || (typeof title === 'string' && title.trim() === '')) return 'Title field is required but empty';
      return null;
    },
  },
  {
    name: 'valid_template',
    severity: 'error' as const,
    check: (item: SitecoreItem) => {
      if (!item.templateId || item.templateId === '00000000-0000-0000-0000-000000000000') return 'Invalid template ID';
      return null;
    },
  },
  {
    name: 'orphan_check',
    severity: 'error' as const,
    check: (item: SitecoreItem, ctx: ValidationContext) => {
      if (!item.parentId) return null;
      const parentExists = ctx.allItems.some(i => i.id === item.parentId);
      if (!parentExists && item.parentId !== '11111111-1111-1111-1111-111111111111') return `Parent ${item.parentId} not in transfer`;
      return null;
    },
  },
  {
    name: 'script_tags',
    severity: 'warning' as const,
    check: (item: SitecoreItem) => {
      for (const [field, value] of Object.entries(item.fields)) {
        if (typeof value === 'string' && value.includes('<script')) return `Field "${field}" contains script tags`;
      }
      return null;
    },
  },
  {
    name: 'media_refs',
    severity: 'warning' as const,
    check: (item: SitecoreItem) => {
      for (const [field, value] of Object.entries(item.fields)) {
        if (typeof value === 'string' && /~\/media\/[a-f0-9-]+/i.test(value)) return `Field "${field}" has media refs to verify`;
      }
      return null;
    },
  },
];

export async function executeValidateContent(
  input: unknown,
  _state: AgentState,
  _targetClient?: SitecoreClient | null
): Promise<ToolResult> {
  try {
    const parsed = InputSchema.parse(input);
    const results: ValidationResult[] = [];
    const ctx: ValidationContext = { allItems: parsed.items as SitecoreItem[], strictMode: parsed.strictMode };

    for (const item of parsed.items) {
      const errors: ValidationResult['errors'] = [];
      for (const rule of validationRules) {
        const msg = rule.check(item as SitecoreItem, ctx);
        if (msg) errors.push({ field: rule.name, message: msg, severity: rule.severity });
      }

      const suggestions: string[] = [];
      if (errors.some(e => e.message.includes('Title'))) suggestions.push(`Set Title to "${item.name}"`);
      if (errors.some(e => e.message.includes('Parent'))) suggestions.push('Include parent in transfer');

      results.push({
        itemId: item.id,
        isValid: !errors.some(e => e.severity === 'error'),
        errors,
        suggestions,
      });
    }

    return {
      toolCallId: '',
      success: true,
      data: {
        results,
        summary: {
          totalItems: results.length,
          validItems: results.filter(r => r.isValid).length,
          invalidItems: results.filter(r => !r.isValid).length,
          totalErrors: results.reduce((s, r) => s + r.errors.filter(e => e.severity === 'error').length, 0),
          totalWarnings: results.reduce((s, r) => s + r.errors.filter(e => e.severity === 'warning').length, 0),
        },
      },
    };
  } catch (error) {
    return { toolCallId: '', success: false, error: error instanceof Error ? error.message : 'Validation error' };
  }
}

export const validateContentTool: ToolDefinition = {
  name: 'validate_content',
  description: 'Validate items against XM Cloud schema',
  inputSchema: InputSchema,
  execute: async (input, state) => executeValidateContent(input, state, null),
};
