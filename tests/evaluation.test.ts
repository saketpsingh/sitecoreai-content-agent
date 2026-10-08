import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  accuracyScore,
  safetyScore,
  performanceScore,
  humanApprovalCompliance,
  failureRecoveryScore,
  EvalResult,
} from '@/evaluation/metrics';
import { getAllTestCases } from '@/evaluation/test-cases';

describe('Evaluation Metrics', () => {
  describe('calculateMetrics', () => {
    it('calculates correct pass rate', () => {
      const results: EvalResult[] = [
        { testId: '1', testName: 'Test 1', category: 'accuracy', passed: true, score: 1.0, latencyMs: 100, details: { input: {}, expectedOutput: {}, actualOutput: {} } },
        { testId: '2', testName: 'Test 2', category: 'accuracy', passed: false, score: 0.0, latencyMs: 200, details: { input: {}, expectedOutput: {}, actualOutput: {} } },
        { testId: '3', testName: 'Test 3', category: 'reliability', passed: true, score: 0.8, latencyMs: 150, details: { input: {}, expectedOutput: {}, actualOutput: {} } },
      ];

      const metrics = calculateMetrics(results);

      expect(metrics.totalTests).toBe(3);
      expect(metrics.passedTests).toBe(2);
      expect(metrics.failedTests).toBe(1);
      expect(metrics.passRate).toBeCloseTo(0.667, 2);
      expect(metrics.avgScore).toBeCloseTo(0.6, 2);
      expect(metrics.avgLatencyMs).toBe(150);
    });

    it('handles empty results', () => {
      const metrics = calculateMetrics([]);
      expect(metrics.totalTests).toBe(0);
      expect(metrics.passRate).toBe(0);
      expect(metrics.avgScore).toBe(0);
    });

    it('groups by category correctly', () => {
      const results: EvalResult[] = [
        { testId: '1', testName: 'Test', category: 'accuracy', passed: true, score: 1.0, latencyMs: 100, details: { input: {}, expectedOutput: {}, actualOutput: {} } },
        { testId: '2', testName: 'Test', category: 'accuracy', passed: true, score: 0.8, latencyMs: 100, details: { input: {}, expectedOutput: {}, actualOutput: {} } },
        { testId: '3', testName: 'Test', category: 'safety', passed: false, score: 0.0, latencyMs: 100, details: { input: {}, expectedOutput: {}, actualOutput: {} } },
      ];

      const metrics = calculateMetrics(results);

      expect(metrics.byCategory['accuracy'].passed).toBe(2);
      expect(metrics.byCategory['accuracy'].failed).toBe(0);
      expect(metrics.byCategory['accuracy'].avgScore).toBe(0.9);
      expect(metrics.byCategory['safety'].passed).toBe(0);
      expect(metrics.byCategory['safety'].failed).toBe(1);
    });
  });

  describe('accuracyScore', () => {
    it('returns 1.0 for exact match', () => {
      expect(accuracyScore({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(1.0);
      expect(accuracyScore('hello', 'hello')).toBe(1.0);
      expect(accuracyScore(42, 42)).toBe(1.0);
    });

    it('returns 0.0 for complete mismatch', () => {
      expect(accuracyScore('hello', 'world')).toBe(0.0);
      expect(accuracyScore(1, 2)).toBe(0.0);
    });

    it('returns partial score for partial object match', () => {
      const score = accuracyScore({ a: 1, b: 2 }, { a: 1, b: 3 });
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('handles case-insensitive string matching', () => {
      expect(accuracyScore('Hello', 'hello')).toBe(1.0);
      expect(accuracyScore('TEST', 'test')).toBe(1.0);
    });
  });

  describe('safetyScore', () => {
    it('returns 1.0 for safe output', () => {
      expect(safetyScore({ message: 'Transfer complete' })).toBe(1.0);
    });

    it('returns 0.0 for dangerous patterns', () => {
      expect(safetyScore({ query: 'DELETE FROM users' })).toBe(0.0);
      expect(safetyScore({ content: '<script>alert("xss")</script>' })).toBe(0.0);
      expect(safetyScore({ data: 'api_key=secret123' })).toBe(0.0);
    });

    it('reduces score for warning patterns', () => {
      const score = safetyScore({ action: 'overwrite existing items' });
      expect(score).toBeLessThan(1.0);
      expect(score).toBeGreaterThan(0.0);
    });
  });

  describe('performanceScore', () => {
    const thresholds = { good: 1000, acceptable: 3000 };

    it('returns 1.0 for fast response', () => {
      expect(performanceScore(500, thresholds)).toBe(1.0);
      expect(performanceScore(1000, thresholds)).toBe(1.0);
    });

    it('returns 0.7 for acceptable response', () => {
      expect(performanceScore(2000, thresholds)).toBe(0.7);
    });

    it('returns low score for slow response', () => {
      expect(performanceScore(5000, thresholds)).toBe(0.4);
      expect(performanceScore(10000, thresholds)).toBe(0.1);
    });
  });

  describe('humanApprovalCompliance', () => {
    it('returns 1.0 when approval comes before import', () => {
      const logs = [
        { operation: 'analyze_dependencies', timestamp: '2024-01-01T00:00:00Z' },
        { operation: 'request_human_approval', timestamp: '2024-01-01T00:01:00Z' },
        { operation: 'import_items', timestamp: '2024-01-01T00:02:00Z' },
      ];
      expect(humanApprovalCompliance(logs)).toBe(1.0);
    });

    it('returns 0.0 when import happens without approval', () => {
      const logs = [
        { operation: 'analyze_dependencies', timestamp: '2024-01-01T00:00:00Z' },
        { operation: 'import_items', timestamp: '2024-01-01T00:01:00Z' },
      ];
      expect(humanApprovalCompliance(logs)).toBe(0.0);
    });

    it('returns 1.0 when no import happens', () => {
      const logs = [
        { operation: 'analyze_dependencies', timestamp: '2024-01-01T00:00:00Z' },
        { operation: 'validate_content', timestamp: '2024-01-01T00:01:00Z' },
      ];
      expect(humanApprovalCompliance(logs)).toBe(1.0);
    });
  });

  describe('failureRecoveryScore', () => {
    it('returns 1.0 when no errors', () => {
      expect(failureRecoveryScore([], 3)).toBe(1.0);
    });

    it('returns high score when errors are recovered', () => {
      const errors = [
        { retryCount: 1 },
        { retryCount: 2 },
      ];
      expect(failureRecoveryScore(errors, 3)).toBeGreaterThan(0.7);
    });

    it('returns lower score when escalation needed', () => {
      const errors = [
        { retryCount: 3 },
      ];
      const score = failureRecoveryScore(errors, 3);
      expect(score).toBeLessThan(1.0);
    });
  });
});

describe('Test Cases', () => {
  it('has all required test case categories', () => {
    const testCases = getAllTestCases();
    const categories = [...new Set(testCases.map(tc => tc.category))];

    expect(categories).toContain('accuracy');
    expect(categories).toContain('reliability');
    expect(categories).toContain('safety');
    expect(categories).toContain('performance');
  });

  it('has valid test case structure', () => {
    const testCases = getAllTestCases();

    for (const tc of testCases) {
      expect(tc.id).toBeDefined();
      expect(tc.name).toBeDefined();
      expect(tc.category).toBeDefined();
      expect(tc.input).toBeDefined();
      expect(tc.expectedBehavior).toBeDefined();
      expect(typeof tc.validator).toBe('function');
    }
  });

  it('has at least 10 test cases', () => {
    const testCases = getAllTestCases();
    expect(testCases.length).toBeGreaterThanOrEqual(10);
  });
});
