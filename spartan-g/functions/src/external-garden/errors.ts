import { AssessmentRewardError } from '../garden-rewards/contracts';
import { GardenValidationError } from '../garden/validation';
import { WateringError } from '../garden-watering/contracts';
import { GardenGateError } from '../garden-production/activation';
import { GardenSafetyError } from '../garden-production/rollout';
export class HttpFailure extends Error {
  constructor(readonly status: number, readonly code: string, readonly reason: string, readonly retryable = false,
    readonly retryAfterSeconds = 0) { super('Garden request could not be confirmed.'); }
}
const statuses: Record<string, number> = { 'invalid-argument':400, 'unauthenticated':401, 'permission-denied':403,
  'not-found':404, 'already-exists':409, 'failed-precondition':409, 'resource-exhausted':429, unavailable:503 };
export function safeFailure(error: unknown): HttpFailure {
  if (error instanceof HttpFailure) return error;
  if (error instanceof GardenSafetyError) return new HttpFailure(statuses[error.code] ?? 409, error.code, error.reason, error.retryable, error.retryAfterSeconds);
  if (error instanceof GardenGateError) return new HttpFailure(error.retryable ? 503 : 409,
    error.retryable ? 'unavailable' : 'failed-precondition', error.reason, error.retryable);
  if (error instanceof AssessmentRewardError || error instanceof WateringError) return new HttpFailure(statuses[error.code] ?? 409,
    error.code, error.reason, error instanceof WateringError && error.retryable);
  if (error instanceof GardenValidationError) return new HttpFailure(400, 'invalid-argument', 'invalid_request');
  return new HttpFailure(503, 'unavailable', 'backend_unavailable', true);
}
