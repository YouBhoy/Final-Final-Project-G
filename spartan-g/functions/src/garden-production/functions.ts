import type { Firestore } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GardenValidationError, parseAssessmentRewardRequest } from '../garden/validation';
import { AssessmentRewardError } from '../garden-rewards/contracts';
import { AssessmentRewardProcessor, trustedSnapshot } from '../garden-rewards/processor';
import type { GardenAdmission, GardenRuntime } from '../garden-rewards/runtime';
import { identity, operationId } from '../garden-rewards/eligibility';
import { GardenWateringProcessor } from '../garden-watering/processor';
import { wateringOperationId } from '../garden-watering/validation';
import { WateringError } from '../garden-watering/contracts';
import { GardenGateError } from './activation';
import { GARDEN_PRODUCTION_REGION } from './runtime';
import { GardenSafetyError } from './rollout';
import { gardenAudit, type GardenAuditSink } from './audit';

function callableFailure(error: unknown): never {
  if (error instanceof GardenSafetyError) throw new HttpsError(error.code, 'Garden operation is not currently available.',
    {reason:error.reason, retryable:error.retryable, ...(error.retryAfterSeconds ? {retryAfterSeconds:error.retryAfterSeconds} : {})});
  if (error instanceof GardenGateError) throw new HttpsError(error.retryable ? 'unavailable' : 'failed-precondition',
    'Garden processing is not currently available.', { reason: error.reason, retryable: error.retryable });
  if (error instanceof GardenValidationError) throw new HttpsError('invalid-argument', 'Only the operation identity is accepted.');
  if (error instanceof AssessmentRewardError || error instanceof WateringError) throw new HttpsError(error.code,
    'Garden operation could not be confirmed.', { reason: error.reason, retryable: error instanceof WateringError && error.retryable });
  throw new HttpsError('unavailable', 'Retry the same Garden operation later.', { retryable: true });
}
/** Shared implementation: tests supply the existing synthetic database guard, never production ADC. */
export function createControlledGardenFunctions(db: Firestore, runtime: GardenRuntime, sink?: GardenAuditSink) {
  runtime.assertDatabase(db);
  const assessment = new AssessmentRewardProcessor(db, runtime);
  const watering = new GardenWateringProcessor(db, undefined, runtime);
  const admit = <T>(operation: GardenAdmission, uid: string, work: () => Promise<T>): Promise<T> =>
    runtime.withAdmission ? runtime.withAdmission(db, operation, uid, work) : work();
  const auditFailure = (error: unknown, operation: GardenAdmission, uid?: string): void => {
    const reason = error instanceof GardenSafetyError || error instanceof GardenGateError
      || error instanceof AssessmentRewardError || error instanceof WateringError ? error.reason : 'backend_unavailable';
    gardenAudit(error instanceof GardenSafetyError && error.code === 'resource-exhausted' ? 'rate_limited'
      : error instanceof GardenSafetyError || error instanceof GardenGateError ? 'authorization_denied' : 'processing_failed',
      {operation, reason, ...(uid ? {studentId:uid} : {})}, sink);
  };
  const assessmentSubmitted = onDocumentUpdated({ document: 'assessment_attempts/{attemptId}',
    database: '(default)', region: GARDEN_PRODUCTION_REGION, retry: true,
    maxInstances:1, minInstances:0, concurrency:5, memory:'256MiB', cpu:1, timeoutSeconds:60 }, async event => {
    if (!event.data || event.data.before.data().status !== 'in_progress' || event.data.after.data().status !== 'submitted') return { status: 'ignored' as const };
    let uid: string | undefined;
    try {
      if (event.params.attemptId !== event.data.after.id) throw new AssessmentRewardError('failed-precondition', 'event_identity_mismatch');
      const before = trustedSnapshot(event.data.before), after = trustedSnapshot(event.data.after);
      uid = identity(after).studentId; // Trusted event/stored identity, never a callable input UID.
      const subject = uid;
      const result = await admit('assessment', subject, async () => {
        await assessment.captureSubmission(before, after);
        gardenAudit('submission_captured', {studentId:subject, operation:'assessment', operationId:operationId(after.id)}, sink);
        return assessment.applyReward(event.params.attemptId);
      });
      gardenAudit(result.status === 'already_applied' ? 'duplicate_detected' : 'assessment_completed',
        {studentId:subject, operation:'assessment', operationId:operationId(after.id)}, sink);
      return result;
    } catch (error) {
      auditFailure(error, 'assessment', uid);
      if (error instanceof GardenSafetyError) {
        if (error.retryable) throw error;
        return {status:'rejected' as const, reason:error.reason};
      }
      if (error instanceof GardenGateError && error.retryable) {
        throw error; // Preserve Eventarc retry; the durable witness also supports owner recovery.
      }
      if (error instanceof AssessmentRewardError || error instanceof GardenGateError) {
        return { status: 'rejected' as const, reason: error.reason };
      }
      throw error;
    }
  });
  const recoverAssessmentReward = onCall({ region:GARDEN_PRODUCTION_REGION,
    maxInstances:2, minInstances:0, concurrency:10, memory:'256MiB', cpu:1, timeoutSeconds:30 }, async request => {
    if (!request.auth) { gardenAudit('unauthenticated', {operation:'recovery'}, sink); throw new HttpsError('unauthenticated', 'Sign in before reward recovery.'); }
    try {
      const uid = request.auth.uid;
      return await admit('recovery', uid, async () => {
        const { attemptId } = parseAssessmentRewardRequest(request.data);
        const result = await assessment.applyReward(attemptId, uid);
        gardenAudit(result.status === 'already_applied' ? 'duplicate_detected' : 'assessment_completed',
          {studentId:uid, operation:'recovery', operationId:operationId(attemptId)}, sink);
        return result;
      });
    } catch (error) { auditFailure(error, 'recovery', request.auth.uid); return callableFailure(error); }
  });
  const waterGarden = onCall({ region:GARDEN_PRODUCTION_REGION,
    maxInstances:2, minInstances:0, concurrency:10, memory:'256MiB', cpu:1, timeoutSeconds:30 }, async request => {
    if (!request.auth) { gardenAudit('unauthenticated', {operation:'watering'}, sink); throw new HttpsError('unauthenticated', 'Sign in before watering.'); }
    try {
      const uid = request.auth.uid;
      return await admit('watering', uid, async () => {
        const result = await watering.water(uid, request.data);
        gardenAudit(result.status === 'replayed' ? 'duplicate_detected' : 'watering_completed',
          {studentId:uid, operation:'watering', operationId:wateringOperationId(uid, result.requestId)}, sink);
        return result;
      });
    } catch (error) { auditFailure(error, 'watering', request.auth.uid); return callableFailure(error); }
  });
  return { assessmentSubmitted, recoverAssessmentReward, waterGarden };
}
