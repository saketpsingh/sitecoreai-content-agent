import { TransferSession, DependencyAnalysis, ValidationResult } from '@/types/sitecore';

export interface ApprovalRequest {
  sessionId: string;
  action: 'transfer' | 'retry' | 'escalate';
  summary: string;
  itemCount: number;
  warnings: string[];
  errors: string[];
}

export interface ApprovalResponse {
  approved: boolean;
  approvedBy: string;
  approvedAt: string;
  notes?: string;
}

export function validateApproval(response: ApprovalResponse): { valid: boolean; reason?: string } {
  if (!response.approvedBy || response.approvedBy.trim() === '') {
    return { valid: false, reason: 'Approver identity required' };
  }
  if (!response.approvedAt) {
    return { valid: false, reason: 'Approval timestamp required' };
  }
  return { valid: true };
}

export function createApprovalRequest(
  session: TransferSession,
  analysis: DependencyAnalysis,
  validation: ValidationResult[]
): ApprovalRequest {
  const warnings = validation.flatMap(v => v.errors.filter(e => e.severity === 'warning').map(e => e.message));
  const errors = validation.flatMap(v => v.errors.filter(e => e.severity === 'error').map(e => e.message));
  const brokenRefWarnings = analysis.brokenReferences.map(br => `Broken ref: ${br.sourceItemId} -> ${br.targetId}`);

  return {
    sessionId: session.id,
    action: 'transfer',
    summary: `Transfer ${analysis.transferOrder.length} items from ${session.request.sourceEnv} to ${session.request.targetEnv}`,
    itemCount: analysis.transferOrder.length,
    warnings: [...warnings, ...brokenRefWarnings],
    errors,
  };
}

export class HumanGate {
  private pendingApprovals = new Map<string, ApprovalRequest>();
  private callbacks = new Map<string, (r: ApprovalResponse) => void>();

  requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    return new Promise(resolve => {
      this.pendingApprovals.set(request.sessionId, request);
      this.callbacks.set(request.sessionId, resolve);
    });
  }

  getPendingApproval(sessionId: string) { return this.pendingApprovals.get(sessionId); }

  submitApproval(sessionId: string, response: ApprovalResponse): boolean {
    const cb = this.callbacks.get(sessionId);
    if (!cb || !response.approvedBy) return false;
    this.pendingApprovals.delete(sessionId);
    this.callbacks.delete(sessionId);
    cb(response);
    return true;
  }

  hasPending(sessionId: string) { return this.pendingApprovals.has(sessionId); }
}

export const humanGate = new HumanGate();
