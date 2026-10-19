import type {
  GardenDocument, GardenOperationReceipt, GardenProgressPatch, StoredTimestamp,
} from './types';

/** Raw attempt fields are untrusted; a future eligibility verifier must inspect them. */
export interface AssessmentAttemptSnapshot {
  readonly id: string;
  readonly data: Readonly<Record<string, unknown>>;
  /** Firestore snapshot metadata, not a client-editable submittedAt field. */
  readonly createTime: StoredTimestamp;
  readonly updateTime: StoredTimestamp;
}

/** Proposed server-only migration gate. It is NOT created by Phase 1. */
export interface GardenServerState {
  readonly studentId: string;
  readonly activatedAt: StoredTimestamp;
  readonly historicalRewards: 'review_required' | 'reviewed';
}

/**
 * Future Admin SDK adapter boundary. No adapter or transaction processor exists here.
 * All reads must precede all writes. Garden + server state + receipt commit atomically.
 * Authentication/student role, eligibility, activation cutoff and history policy must
 * be checked before staging a write. Callbacks may retry: no external side effects.
 */
export interface GardenTransaction {
  readStudent(studentId: string): Promise<Readonly<Record<string, unknown>> | null>;
  readAttempt(attemptId: string): Promise<AssessmentAttemptSnapshot | null>;
  readGarden(studentId: string): Promise<GardenDocument | null>;
  readServerState(studentId: string): Promise<GardenServerState | null>;
  readReceipt(operationId: string): Promise<GardenOperationReceipt | null>;

  /** Create only when missing; adapter supplies server timestamps and fails on conflicts. */
  createInitialGarden(studentId: string): void;
  /** Update named progression fields; retain createdAt and unknown legacy fields. */
  updateGarden(studentId: string, patch: GardenProgressPatch): void;
  writeServerState(state: GardenServerState): void;
  /** Same transaction as reward; receipt paths must be inaccessible to ordinary clients. */
  writeReceipt(receipt: GardenOperationReceipt): void;
}

export interface GardenTransactionRunner {
  run<T>(work: (transaction: GardenTransaction) => Promise<T>): Promise<T>;
}
