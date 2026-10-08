import { describe, it, expect, vi } from 'vitest';
import { HumanGate, createApprovalRequest, validateApproval } from '@/lib/human-gate';
import { TransferSession, DependencyAnalysis, ValidationResult } from '@/types/sitecore';

describe('Human Gate', () => {
  it('creates approval request with correct summary', () => {
    const session: TransferSession = {
      id: 'session-123',
      request: {
        sourceEnv: 'dev',
        targetEnv: 'staging',
        itemPaths: ['/sitecore/content/Home'],
        includeDescendants: true,
        includeDependencies: true,
        conflictResolution: 'overwrite',
      },
      status: 'awaiting_approval',
      errors: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const analysis: DependencyAnalysis = {
      rootItem: { id: '1', name: 'Home', path: '/sitecore/content/Home', templateId: 't1', templateName: 'Page', parentId: null, language: 'en', version: 1, fields: {} },
      dependencies: [],
      mediaReferences: [],
      brokenReferences: [],
      circularReferences: [],
      transferOrder: ['1', '2', '3'],
    };

    const validation: ValidationResult[] = [
      { itemId: '1', isValid: true, errors: [], suggestions: [] },
    ];

    const request = createApprovalRequest(session, analysis, validation);

    expect(request.sessionId).toBe('session-123');
    expect(request.itemCount).toBe(3);
    expect(request.summary).toContain('dev');
    expect(request.summary).toContain('staging');
  });

  it('collects warnings from validation', () => {
    const session: TransferSession = {
      id: 'session-123',
      request: { sourceEnv: 'dev', targetEnv: 'staging', itemPaths: [], includeDescendants: true, includeDependencies: true, conflictResolution: 'overwrite' },
      status: 'awaiting_approval',
      errors: [],
      createdAt: '',
      updatedAt: '',
    };

    const analysis: DependencyAnalysis = {
      rootItem: { id: '1', name: 'Home', path: '/', templateId: 't1', templateName: 'Page', parentId: null, language: 'en', version: 1, fields: {} },
      dependencies: [],
      mediaReferences: [],
      brokenReferences: [{ sourceItemId: 's1', fieldName: 'f1', targetId: 't1', reason: 'Not found' }],
      circularReferences: [],
      transferOrder: ['1'],
    };

    const validation: ValidationResult[] = [
      { itemId: '1', isValid: true, errors: [{ field: 'content', message: 'Has script tags', severity: 'warning' }], suggestions: [] },
    ];

    const request = createApprovalRequest(session, analysis, validation);

    expect(request.warnings).toContain('Has script tags');
    expect(request.warnings).toContainEqual(expect.stringContaining('Broken ref'));
  });

  it('validates approval response requires approver', () => {
    const result = validateApproval({
      approved: true,
      approvedBy: '',
      approvedAt: new Date().toISOString(),
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('identity');
  });

  it('validates approval response requires timestamp', () => {
    const result = validateApproval({
      approved: true,
      approvedBy: 'user@example.com',
      approvedAt: '',
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('timestamp');
  });

  it('accepts valid approval', () => {
    const result = validateApproval({
      approved: true,
      approvedBy: 'user@example.com',
      approvedAt: new Date().toISOString(),
    });

    expect(result.valid).toBe(true);
  });
});

describe('HumanGate Class', () => {
  it('tracks pending approvals', () => {
    const gate = new HumanGate();

    gate.requestApproval({
      sessionId: 'session-1',
      action: 'transfer',
      summary: 'Test transfer',
      itemCount: 5,
      warnings: [],
      errors: [],
    });

    expect(gate.hasPending('session-1')).toBe(true);
    expect(gate.hasPending('session-2')).toBe(false);
  });

  it('resolves approval promise on submit', async () => {
    const gate = new HumanGate();

    const approvalPromise = gate.requestApproval({
      sessionId: 'session-1',
      action: 'transfer',
      summary: 'Test',
      itemCount: 1,
      warnings: [],
      errors: [],
    });

    setTimeout(() => {
      gate.submitApproval('session-1', {
        approved: true,
        approvedBy: 'tester',
        approvedAt: new Date().toISOString(),
      });
    }, 10);

    const result = await approvalPromise;
    expect(result.approved).toBe(true);
    expect(result.approvedBy).toBe('tester');
  });

  it('clears pending after approval', async () => {
    const gate = new HumanGate();

    gate.requestApproval({
      sessionId: 'session-1',
      action: 'transfer',
      summary: 'Test',
      itemCount: 1,
      warnings: [],
      errors: [],
    });

    expect(gate.hasPending('session-1')).toBe(true);

    gate.submitApproval('session-1', {
      approved: false,
      approvedBy: 'tester',
      approvedAt: new Date().toISOString(),
    });

    expect(gate.hasPending('session-1')).toBe(false);
  });

  it('rejects invalid approval submissions', () => {
    const gate = new HumanGate();

    const result = gate.submitApproval('nonexistent-session', {
      approved: true,
      approvedBy: 'tester',
      approvedAt: new Date().toISOString(),
    });

    expect(result).toBe(false);
  });
});
