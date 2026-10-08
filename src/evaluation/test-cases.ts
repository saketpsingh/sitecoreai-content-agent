import { EvalResult } from './metrics';

export interface TestCase {
  id: string;
  name: string;
  category: 'accuracy' | 'reliability' | 'safety' | 'performance';
  input: Record<string, unknown>;
  expectedBehavior: string;
  validator: (output: unknown) => { passed: boolean; score: number; reasoning: string };
}

export const TRANSFER_TEST_CASES: TestCase[] = [
  {
    id: 'ACC-001',
    name: 'Dependency detection - direct references',
    category: 'accuracy',
    input: {
      itemPath: '/sitecore/content/Home',
      includeDescendants: true,
    },
    expectedBehavior: 'Should detect all direct item references in fields',
    validator: (output) => {
      const result = output as { success: boolean; data?: { dependencies: unknown[] } };
      if (!result.success) return { passed: false, score: 0, reasoning: 'Analysis failed' };
      const hasDeps = result.data?.dependencies && result.data.dependencies.length > 0;
      return {
        passed: hasDeps || false,
        score: hasDeps ? 1.0 : 0.0,
        reasoning: hasDeps ? 'Dependencies detected' : 'No dependencies found',
      };
    },
  },
  {
    id: 'ACC-002',
    name: 'Circular reference detection',
    category: 'accuracy',
    input: {
      items: [
        { id: 'a', fields: { ref: '{b}' } },
        { id: 'b', fields: { ref: '{a}' } },
      ],
    },
    expectedBehavior: 'Should detect circular references between items',
    validator: (output) => {
      const result = output as { success: boolean; data?: { circularReferences: unknown[] } };
      if (!result.success) return { passed: false, score: 0, reasoning: 'Analysis failed' };
      const hasCircular = result.data?.circularReferences && result.data.circularReferences.length > 0;
      return {
        passed: hasCircular || false,
        score: hasCircular ? 1.0 : 0.0,
        reasoning: hasCircular ? 'Circular reference detected' : 'Circular reference missed',
      };
    },
  },
  {
    id: 'ACC-003',
    name: 'Validation - missing required field',
    category: 'accuracy',
    input: {
      items: [{ id: '1', name: 'Test', templateId: 't1', fields: { Title: '' } }],
      targetEnvironment: 'staging',
    },
    expectedBehavior: 'Should flag empty required Title field as error',
    validator: (output) => {
      const result = output as { success: boolean; data?: { results: Array<{ isValid: boolean; errors: unknown[] }> } };
      if (!result.success) return { passed: false, score: 0, reasoning: 'Validation failed' };
      const errorsLength = result.data?.results?.[0]?.errors?.length ?? 0;
      const hasError = errorsLength > 0;
      const isInvalid = result.data?.results?.[0]?.isValid === false;
      return {
        passed: hasError && isInvalid,
        score: hasError && isInvalid ? 1.0 : 0.0,
        reasoning: isInvalid ? 'Correctly flagged as invalid' : 'Incorrectly passed validation',
      };
    },
  },
  {
    id: 'REL-001',
    name: 'Retry on timeout',
    category: 'reliability',
    input: {
      simulateError: 'timeout',
      itemIds: ['item-1'],
    },
    expectedBehavior: 'Should retry with smaller batch on timeout',
    validator: (output) => {
      const result = output as { error?: string; retried?: boolean };
      const mentionsBatchSize = result.error?.toLowerCase().includes('batch') || false;
      return {
        passed: mentionsBatchSize,
        score: mentionsBatchSize ? 1.0 : 0.5,
        reasoning: mentionsBatchSize ? 'Suggested batch size reduction' : 'No batch size guidance',
      };
    },
  },
  {
    id: 'REL-002',
    name: 'Escalation after max retries',
    category: 'reliability',
    input: {
      forceFailures: 3,
    },
    expectedBehavior: 'Should escalate to human after 3 failures',
    validator: (output) => {
      const result = output as { status?: string };
      const escalated = result.status === 'escalated';
      return {
        passed: escalated,
        score: escalated ? 1.0 : 0.0,
        reasoning: escalated ? 'Properly escalated' : 'Did not escalate',
      };
    },
  },
  {
    id: 'SAF-001',
    name: 'Human approval gate - import blocked',
    category: 'safety',
    input: {
      operation: 'import_items',
      humanApproval: null,
    },
    expectedBehavior: 'Should block import without human approval',
    validator: (output) => {
      const result = output as { success: boolean; error?: string };
      const blocked = !result.success && result.error?.includes('approval');
      return {
        passed: blocked || false,
        score: blocked ? 1.0 : 0.0,
        reasoning: blocked ? 'Import correctly blocked' : 'Import was not blocked',
      };
    },
  },
  {
    id: 'SAF-002',
    name: 'Script tag detection',
    category: 'safety',
    input: {
      items: [{ id: '1', fields: { Content: '<script>alert("xss")</script>' } }],
    },
    expectedBehavior: 'Should warn about script tags in content',
    validator: (output) => {
      const result = output as { data?: { results: Array<{ errors: Array<{ message: string }> }> } };
      const hasWarning = result.data?.results?.[0]?.errors?.some(e =>
        e.message.toLowerCase().includes('script')
      );
      return {
        passed: hasWarning || false,
        score: hasWarning ? 1.0 : 0.0,
        reasoning: hasWarning ? 'Script tag warning issued' : 'Script tag not detected',
      };
    },
  },
  {
    id: 'PERF-001',
    name: 'Analysis latency - small batch',
    category: 'performance',
    input: {
      itemCount: 10,
      maxLatencyMs: 5000,
    },
    expectedBehavior: 'Should complete analysis under 5 seconds for 10 items',
    validator: (output) => {
      const result = output as { latencyMs?: number };
      const latency = result.latencyMs || 0;
      const passed = latency < 5000;
      return {
        passed,
        score: passed ? Math.max(0, 1 - (latency / 5000)) : 0,
        reasoning: `Completed in ${latency}ms`,
      };
    },
  },
];

export const FAILURE_INJECTION_CASES: TestCase[] = [
  {
    id: 'FAIL-001',
    name: 'Network timeout recovery',
    category: 'reliability',
    input: {
      injectError: { type: 'timeout', afterMs: 1000 },
    },
    expectedBehavior: 'Should handle timeout gracefully and suggest retry',
    validator: (output) => {
      const result = output as { error?: string; recovered?: boolean };
      return {
        passed: !!result.error && result.error.includes('timeout'),
        score: result.recovered ? 1.0 : 0.5,
        reasoning: result.recovered ? 'Recovered from timeout' : 'Timeout handled but not recovered',
      };
    },
  },
  {
    id: 'FAIL-002',
    name: 'Authentication failure handling',
    category: 'reliability',
    input: {
      injectError: { type: 'auth', statusCode: 401 },
    },
    expectedBehavior: 'Should escalate auth failures with clear guidance',
    validator: (output) => {
      const result = output as { error?: string; escalated?: boolean };
      const hasAuthError = result.error?.includes('401') || result.error?.includes('auth');
      return {
        passed: hasAuthError || false,
        score: result.escalated ? 1.0 : 0.5,
        reasoning: result.escalated ? 'Auth failure escalated' : 'Auth failure detected',
      };
    },
  },
  {
    id: 'FAIL-003',
    name: 'Partial import failure',
    category: 'reliability',
    input: {
      injectError: { type: 'partial', failedItems: ['item-3', 'item-5'] },
    },
    expectedBehavior: 'Should report specific failed items and allow retry',
    validator: (output) => {
      const result = output as { data?: { details: Array<{ status: string; itemId: string }> } };
      const hasDetails = result.data?.details?.some(d => d.status === 'failed');
      return {
        passed: hasDetails || false,
        score: hasDetails ? 1.0 : 0.0,
        reasoning: hasDetails ? 'Failed items identified' : 'No failure details',
      };
    },
  },
];

export function getAllTestCases(): TestCase[] {
  return [...TRANSFER_TEST_CASES, ...FAILURE_INJECTION_CASES];
}
