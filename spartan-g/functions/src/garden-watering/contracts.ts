import type { Timestamp } from 'firebase-admin/firestore';
import type { GardenOperation, GardenOperationReceipt, GardenState, WateringCalculation } from '../garden/types';
import { REWARD_PATHS } from '../garden-rewards/contracts';

export const WATERING_PATHS = Object.freeze({
  control: 'garden_reward_control/watering_v1',
  receipts: REWARD_PATHS.receipts,
});

export type WateringIdentity = Extract<GardenOperation, { kind: 'watering' }>;
type ReceiptMetadata = {
  readonly schemaVersion: 1;
  readonly identity: WateringIdentity;
  readonly activationAt: Timestamp;
  readonly requestedAt: Timestamp;
  /** Validated projection used to verify the saved calculation on replay. */
  readonly before: GardenState;
};

export type WateringReceipt = ReceiptMetadata & (
  | (Extract<GardenOperationReceipt, { status: 'applied' }> & {
    readonly result: Extract<WateringCalculation, { status: 'rewarded' }>;
  })
  | (Extract<GardenOperationReceipt, { status: 'already_watered' }> & {
    readonly result: Extract<WateringCalculation, { status: 'already' }>;
  })
);

/** Separate deterministic record in the same deny-client receipt namespace. */
export interface WateringDayClaim {
  readonly schemaVersion: 1;
  readonly kind: 'watering_day';
  readonly guardId: string;
  readonly studentId: string;
  readonly day: WateringCalculation['day'];
  readonly operationId: string;
  readonly requestId: string;
  readonly policyVersion: 'legacy-v1';
  readonly activationAt: Timestamp;
  readonly recordedAt: Timestamp;
}

export interface WateringResponse {
  readonly status: 'rewarded' | 'already_watered' | 'replayed';
  readonly requestId: string;
  /** Replay returns the original result, not a fresh reward or current balance. */
  readonly result: WateringCalculation;
}

export type WateringErrorCode = 'unauthenticated' | 'permission-denied' | 'invalid-argument'
  | 'not-found' | 'failed-precondition' | 'unavailable';

export class WateringError extends Error {
  constructor(readonly code: WateringErrorCode, readonly reason: string, readonly retryable = false) {
    super(`Garden watering rejected: ${reason}`);
    this.name = 'WateringError';
  }
}
