import type { Timestamp } from 'firebase-admin/firestore';
import type { GardenOperationReceipt, RewardCalculation, ServerOperation } from '../garden/types';

export const LOCAL_REWARD_PROJECT = 'demo-spartan-g-garden-phase2';
export const REWARD_PATHS = Object.freeze({
  control: 'garden_reward_control/assessment_v1',
  submissions: 'garden_reward_submissions',
  receipts: 'garden_reward_receipts',
});

export type RewardErrorCode = 'invalid-argument' | 'permission-denied' | 'failed-precondition'
  | 'not-found' | 'already-exists';

export class AssessmentRewardError extends Error {
  constructor(readonly code: RewardErrorCode, readonly reason: string) {
    super(`Assessment reward rejected: ${reason}`);
    this.name = 'AssessmentRewardError';
  }
}

export interface QuestionContract {
  readonly id: string;
  readonly type: 'multiple_choice' | 'true_false' | 'short_answer';
  readonly optionIds: readonly string[];
}

export interface TrustedAttemptSnapshot {
  readonly id: string;
  readonly path: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly createTime: Timestamp;
  readonly updateTime: Timestamp;
}

/** Written only from a verified trigger event, never synthesized by recovery. */
export interface SubmissionWitness extends ServerOperation {
  readonly schemaVersion: 1;
  readonly identity: {
    readonly kind: 'assessment_reward'; readonly studentId: string; readonly attemptId: string;
  };
  readonly assessmentId: string;
  readonly attemptNumber: number;
  readonly attemptCreateTime: Timestamp;
  readonly submissionTime: Timestamp;
  readonly activationAt: Timestamp;
  readonly definitionRevision: Timestamp;
  readonly questions: readonly QuestionContract[];
  /** Binds identity and answer values without duplicating sensitive answer text. */
  readonly submissionHash: string;
  readonly recordedAt: Timestamp;
}

export type AppliedAssessmentReceipt = Extract<GardenOperationReceipt, { status: 'applied' }> & {
  readonly schemaVersion: 1;
  readonly attemptCreateTime: Timestamp;
  readonly submissionTime: Timestamp;
  readonly activationAt: Timestamp;
  readonly submissionHash: string;
};

export interface AssessmentRewardResponse {
  readonly status: 'applied' | 'already_applied';
  readonly attemptId: string;
  readonly result: RewardCalculation;
}
