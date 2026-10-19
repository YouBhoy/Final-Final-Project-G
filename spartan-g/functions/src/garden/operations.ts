import type { GardenOperation, GardenOperationReceipt, ReceiptDisposition, ServerOperation } from './types';
import { parseUtcDay } from './dates';
import { GardenValidationError, parseDocumentId } from './validation';

function validateIdentity(identity: GardenOperation): void {
  parseDocumentId(identity.studentId, 'studentId');
  switch (identity.kind) {
    case 'assessment_reward': parseDocumentId(identity.attemptId, 'attemptId'); break;
    case 'watering': parseDocumentId(identity.requestId, 'requestId'); break;
    default: throw new GardenValidationError('kind', 'unknown Garden operation');
  }
}

/** Compare structured fields, avoiding ambiguous concatenated identity strings. */
function sameIdentity(left: GardenOperation, right: GardenOperation): boolean {
  if (left.studentId !== right.studentId) return false;
  return left.kind === 'assessment_reward' && right.kind === 'assessment_reward'
    ? left.attemptId === right.attemptId
    : left.kind === 'watering' && right.kind === 'watering' && left.requestId === right.requestId;
}

/**
 * A pure contract check, not a receipt store or deduplication implementation.
 * A pending receipt must be resumed, never mistaken for an applied reward.
 * On retry, use the original stored rewardDay, including across UTC midnight.
 */
export function classifyReceipt(
  operation: ServerOperation, receipt: GardenOperationReceipt | null,
): ReceiptDisposition {
  parseDocumentId(operation.operationId, 'operationId');
  validateIdentity(operation.identity);
  parseUtcDay(operation.rewardDay);
  if (operation.policyVersion !== 'legacy-v1') {
    throw new GardenValidationError('policyVersion', 'unsupported reward policy');
  }
  if (receipt === null) return 'new';
  validateIdentity(receipt.identity);
  if (operation.operationId !== receipt.operationId || !sameIdentity(operation.identity, receipt.identity)
      || receipt.policyVersion !== operation.policyVersion) {
    throw new GardenValidationError('receipt', 'operation identity or policy conflict');
  }
  parseUtcDay(receipt.rewardDay);
  switch (receipt.status) {
    case 'pending': return 'resume_pending';
    case 'applied': return 'replay_applied';
    case 'already_watered':
      if (receipt.identity.kind !== 'watering') {
        throw new GardenValidationError('receipt', 'assessment cannot be already watered');
      }
      return 'replay_already_watered';
    case 'review_required': return 'manual_review';
    default: throw new GardenValidationError('receipt', 'unknown receipt status');
  }
}
