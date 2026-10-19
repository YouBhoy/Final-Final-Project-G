import type { Firestore } from 'firebase-admin/firestore';
import { parseAssessmentRewardRequest } from '../garden/validation';
import { requestId, wateringOperationId } from '../garden-watering/validation';
import { GardenWateringProcessor } from '../garden-watering/processor';
import { gardenAudit, type GardenAuditSink } from '../garden-production/audit';
import { operationId } from '../garden-rewards/eligibility';
import type { GardenAdmission, GardenRuntime } from '../garden-rewards/runtime';
import { GardenFinalizer } from './finalizer';
import { safeFailure } from './errors';

export type ExternalAction = 'finalize' | 'recover' | 'water';
export interface GardenHttpService { execute(action: ExternalAction, uid: string, body: unknown): Promise<unknown>; ready(): Promise<void> }
export function createGardenHttpService(db: Firestore, runtime: GardenRuntime,
  clock: () => Date = () => new Date(), sink?: GardenAuditSink): GardenHttpService {
  runtime.assertDatabase(db);
  if (!runtime.withAdmission) throw Error('External HTTP requires the complete safety runtime');
  const finalizer = new GardenFinalizer(db, runtime), watering = new GardenWateringProcessor(db, clock, runtime);
  return {
    async ready() { runtime.assertDatabase(db); await db.doc('garden_rollout/config_v1').get(); },
    async execute(action, uid, body) {
      const admission: GardenAdmission = action === 'water' ? 'watering' : action === 'finalize' ? 'assessment' : 'recovery';
      try {
        return await runtime.withAdmission!(db, admission, uid, async () => {
          if (action === 'water') {
            // Match the existing identity-only callable parser; never accept a body UID.
            const id = requestId(body);
            const result = await watering.water(uid, {requestId:id});
            gardenAudit(result.status === 'replayed' ? 'duplicate_detected' : 'watering_completed',
              {studentId:uid, operation:'watering', operationId:wateringOperationId(uid,id)}, sink);
            return result;
          }
          const {attemptId} = parseAssessmentRewardRequest(body);
          if (action === 'finalize') {
            const newlySubmitted = await finalizer.submit(uid, attemptId);
            gardenAudit('submission_captured', {studentId:uid, operation:'assessment', operationId:operationId(attemptId)}, sink);
            // A committed submission survives a later pause/temporary reward failure.
            try {
              // A retry of an existing completion is recovery, including its switch/budget.
              const result = newlySubmitted ? await (async () => {
                await finalizer.materialize(uid, attemptId);
                // Ownership checked; the canonical identity cannot be reassigned.
                return finalizer.rewards.applyReward(attemptId);
              })() : await runtime.withAdmission!(db,'recovery',uid,()=>finalizer.recover(uid,attemptId));
              gardenAudit(result.status === 'already_applied' ? 'duplicate_detected' : 'assessment_completed',
                {studentId:uid, operation:'assessment', operationId:operationId(attemptId)}, sink);
              return { ...result, submissionStatus:'submitted' };
            } catch (error) {
              const failure = safeFailure(error);
              gardenAudit('processing_failed', {studentId:uid, operation:'assessment', reason:failure.reason}, sink);
              return { status:'pending', attemptId, submissionStatus:'submitted',
                reward: {code:failure.code, reason:failure.reason, retryable:failure.retryable} };
            }
          }
          const result = await finalizer.recover(uid, attemptId);
          gardenAudit(result.status === 'already_applied' ? 'duplicate_detected' : 'assessment_completed',
            {studentId:uid, operation:'recovery', operationId:operationId(attemptId)}, sink);
          return result;
        });
      } catch (error) {
        const failure = safeFailure(error);
        gardenAudit(failure.status === 429 ? 'rate_limited' : failure.status === 403 || failure.status === 409 ? 'authorization_denied' : 'processing_failed',
          {studentId:uid, operation:admission, reason:failure.reason}, sink);
        throw failure;
      }
    },
  };
}
