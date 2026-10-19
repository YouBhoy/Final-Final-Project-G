import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { parseAssessmentRewardRequest, GardenValidationError } from '../garden/validation';
import { AssessmentRewardError } from './contracts';
import { AssessmentRewardProcessor, trustedSnapshot } from './processor';
import { assertLocalRewardDatabase } from './local-safety';

/** Factory only: deliberately absent from src/index.ts and the deployed export graph. */
export function createLocalAssessmentRewardFunctions(db: Firestore) {
  assertLocalRewardDatabase(db);
  const processor = new AssessmentRewardProcessor(db);
  const assessmentSubmitted = onDocumentUpdated({
    document: 'assessment_attempts/{attemptId}', database: '(default)', region: 'us-central1', retry: true,
  }, async event => {
    if (!event.data || event.data.before.data().status !== 'in_progress'
        || event.data.after.data().status !== 'submitted') return { status: 'ignored' as const };
    try {
      if (event.params.attemptId !== event.data.after.id) throw new AssessmentRewardError('failed-precondition', 'event_identity_mismatch');
      await processor.captureSubmission(trustedSnapshot(event.data.before), trustedSnapshot(event.data.after));
      return await processor.applyReward(event.params.attemptId);
    } catch (error) {
      if (error instanceof AssessmentRewardError) {
        logger.warn('garden_assessment_reward_rejected', { reason: error.reason, code: error.code });
        return { status: 'rejected' as const, reason: error.reason };
      }
      // Let retryable infrastructure failures reach the event runtime. No answer data is logged.
      logger.error('garden_assessment_reward_failed', { retryable: true });
      throw error;
    }
  });

  const recoverAssessmentReward = onCall({ region: 'us-central1' }, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before requesting reward recovery.');
    try {
      const { attemptId } = parseAssessmentRewardRequest(request.data);
      return await processor.applyReward(attemptId, request.auth.uid);
    } catch (error) {
      if (error instanceof GardenValidationError) throw new HttpsError('invalid-argument', 'Only a valid attemptId is accepted.');
      if (error instanceof AssessmentRewardError) {
        throw new HttpsError(error.code, 'Reward recovery is not available for this attempt.', { reason: error.reason, retryable: false });
      }
      logger.error('garden_reward_recovery_failed', { retryable: true });
      throw new HttpsError('unavailable', 'Reward processing is temporarily unavailable. Retry the same attempt.', { retryable: true });
    }
  });
  return { assessmentSubmitted, recoverAssessmentReward };
}
