/** Server-side domain contracts only. This module has no Firebase side effects. */
declare const utcDayBrand: unique symbol;
export type UtcDay = string & { readonly [utcDayBrand]: true };

/** Structural subset shared by Firestore Admin timestamps; not a write sentinel. */
export interface StoredTimestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
}

export interface GardenState {
  readonly studentId: string;
  readonly level: number;
  readonly xp: number;
  readonly seeds: number;
  readonly streakCount: number;
  readonly lastCheckInDate: UtcDay | '';
  readonly lastWateredDate: UtcDay | '';
}

/** Stored document at student_gardens/{studentId}; its ID is not a stored field. */
export interface GardenDocument extends GardenState {
  readonly createdAt: StoredTimestamp;
  readonly updatedAt: StoredTimestamp;
}

/** Only these existing mutable fields belong in a future transaction update. */
export type GardenProgressPatch = Omit<GardenState, 'studentId'>;

export interface RewardCalculation {
  readonly day: UtcDay;
  readonly garden: GardenState;
  readonly xpAwarded: number;
  readonly seedsAwarded: number;
  readonly leveledUp: boolean;
}

export type WateringCalculation =
  | (RewardCalculation & { readonly status: 'rewarded' })
  | { readonly status: 'already'; readonly day: UtcDay; readonly garden: GardenState };

/** Clients supply identities only, never reward amounts, owners or dates. */
export interface AssessmentRewardRequest { readonly attemptId: string }
export interface WateringRequest { readonly requestId: string }

/** Internal identities must be constructed after authentication/ownership checks. */
export type GardenOperation =
  | { readonly kind: 'assessment_reward'; readonly studentId: string; readonly attemptId: string }
  | { readonly kind: 'watering'; readonly studentId: string; readonly requestId: string };

export interface ServerOperation {
  /** Deterministic, collision-safe ID derived from the full operation identity. */
  readonly operationId: string;
  readonly identity: GardenOperation;
  readonly policyVersion: 'legacy-v1';
  /** Assigned once by the future trusted entry point, never by a client. */
  readonly rewardDay: UtcDay;
}

interface ReceiptBase extends ServerOperation {
  readonly recordedAt: StoredTimestamp;
}

/** Server-only records; no collection is created or connected by these types. */
export type GardenOperationReceipt =
  | (ReceiptBase & { readonly status: 'pending' })
  | (ReceiptBase & { readonly status: 'applied'; readonly result: RewardCalculation })
  | (ReceiptBase & { readonly status: 'already_watered' })
  | (ReceiptBase & { readonly status: 'review_required'; readonly reason: string });

export type ReceiptDisposition = 'new' | 'resume_pending' | 'replay_applied'
  | 'replay_already_watered' | 'manual_review';
