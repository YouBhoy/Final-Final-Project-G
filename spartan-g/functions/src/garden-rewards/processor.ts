import {
  FieldValue, Timestamp, type DocumentSnapshot, type Firestore,
} from 'firebase-admin/firestore';
import { calculateAssessmentReward, createInitialGardenState, GARDEN_POLICY } from '../garden/policy';
import { parseGardenDocument, parseGardenState, GardenValidationError } from '../garden/validation';
import { parseUtcDay } from '../garden/dates';
import { classifyReceipt } from '../garden/operations';
import type { RewardCalculation } from '../garden/types';
import {
  REWARD_PATHS, type AppliedAssessmentReceipt, type AssessmentRewardResponse,
  type SubmissionWitness, type TrustedAttemptSnapshot,
} from './contracts';
import {
  activeStudent, after, bindAttempt, documentId, identity, object, operationId,
  parseWitness, reject, sameTime, stamp, submissionHash,
} from './eligibility';
import { localGardenRuntime, runGardenTransaction, type GardenRuntime } from './runtime';
import { validateSubmissionDefinition } from './definition';

export function trustedSnapshot(snapshot: DocumentSnapshot): TrustedAttemptSnapshot {
  if (!snapshot.exists || !snapshot.createTime || !snapshot.updateTime) reject('attempt_not_found', 'not-found');
  return { id: snapshot.id, path: snapshot.ref.path, data: object(snapshot.data()),
    createTime: snapshot.createTime, updateTime: snapshot.updateTime };
}

function readReceipt(value: unknown, witness: SubmissionWitness): AppliedAssessmentReceipt {
  const data = object(value);
  const result = object(data.result);
  const who = object(data.identity);
  const parsed: AppliedAssessmentReceipt = {
    schemaVersion: 1, status: 'applied', operationId: documentId(data.operationId),
    identity: { kind: 'assessment_reward', studentId: documentId(who.studentId), attemptId: documentId(who.attemptId) },
    policyVersion: 'legacy-v1', rewardDay: parseUtcDay(data.rewardDay), recordedAt: stamp(data.recordedAt),
    attemptCreateTime: stamp(data.attemptCreateTime), submissionTime: stamp(data.submissionTime),
    activationAt: stamp(data.activationAt), submissionHash: typeof data.submissionHash === 'string' ? data.submissionHash : '',
    result: {
      day: parseUtcDay(result.day), garden: parseGardenState(result.garden, witness.identity.studentId),
      xpAwarded: GARDEN_POLICY.assessmentXp, seedsAwarded: GARDEN_POLICY.assessmentSeeds,
      leveledUp: result.leveledUp === true,
    },
  };
  if (data.schemaVersion !== 1 || data.status !== 'applied' || who.kind !== 'assessment_reward'
      || data.policyVersion !== 'legacy-v1' || result.xpAwarded !== GARDEN_POLICY.assessmentXp
      || result.seedsAwarded !== GARDEN_POLICY.assessmentSeeds || typeof result.leveledUp !== 'boolean'
      || parsed.result.day !== witness.rewardDay || parsed.rewardDay !== witness.rewardDay
      || parsed.submissionHash !== witness.submissionHash || !sameTime(parsed.attemptCreateTime, witness.attemptCreateTime)
      || !sameTime(parsed.submissionTime, witness.submissionTime) || !sameTime(parsed.activationAt, witness.activationAt)
      || classifyReceipt(witness, parsed) !== 'replay_applied') reject('receipt_conflict');
  return parsed;
}

/** Trusted processor; original local fence remains the default runtime. */
export class AssessmentRewardProcessor {
  constructor(private readonly db: Firestore, private readonly runtime: GardenRuntime = localGardenRuntime) { runtime.assertDatabase(db); }

  /**
   * Trust boundary: called only by the submission trigger, with backend event snapshots.
   * Recovery cannot invoke this path. Recording proof does not award any reward.
   */
  async captureSubmission(before: TrustedAttemptSnapshot, submitted: TrustedAttemptSnapshot): Promise<void> {
    this.runtime.assertDatabase(this.db);
    const who = identity(submitted);
    const previous = identity(before);
    if (before.data.status !== 'in_progress' || submitted.data.status !== 'submitted'
        || before.id !== submitted.id || previous.studentId !== who.studentId
        || previous.assessmentId !== who.assessmentId || previous.attemptNumber !== who.attemptNumber
        || !sameTime(before.createTime, submitted.createTime) || !after(submitted.updateTime, before.updateTime)) {
      reject('invalid_submission_transition');
    }
    const key = operationId(submitted.id);
    await runGardenTransaction(this.runtime, this.db, async transaction => {
      const [control, attemptDoc, user, definition, override, priorWitness] = await transaction.getAll(
        this.db.doc(REWARD_PATHS.control), this.db.doc(submitted.path), this.db.doc(`users/${who.studentId}`),
        this.db.doc(`assessments/${who.assessmentId}`),
        this.db.doc(`assessment_overrides/${who.assessmentId}_${who.studentId}`),
        this.db.doc(`${REWARD_PATHS.submissions}/${key}`),
      );
      if (!control || !attemptDoc || !user || !definition || !override || !priorWitness) throw new Error('Incomplete transaction snapshot set');
      const cutoff = await this.runtime.activation(transaction, control, 'capture', {
        studentId: who.studentId, operationId: key, attemptCreateTime: submitted.createTime, submissionTime: submitted.updateTime,
      });
      if (!after(submitted.createTime, cutoff)) reject('historical_attempt');
      activeStudent(user.data());
      const current = trustedSnapshot(attemptDoc);
      if (priorWitness.exists) {
        const witness = parseWitness(priorWitness.data(), key);
        if (!sameTime(witness.activationAt, cutoff) || !sameTime(witness.submissionTime, submitted.updateTime)
            || submissionHash(submitted, witness.questions) !== witness.submissionHash) reject('witness_conflict');
        bindAttempt(witness, current);
        return;
      }
      const questions = await validateSubmissionDefinition(transaction, this.db, submitted, definition, override);
      if (!definition.updateTime) reject('definition_not_found');
      const witness: SubmissionWitness = {
        schemaVersion: 1, operationId: key, identity: { kind: 'assessment_reward', studentId: who.studentId, attemptId: submitted.id },
        policyVersion: 'legacy-v1', rewardDay: parseUtcDay(submitted.updateTime.toDate().toISOString().slice(0, 10)),
        assessmentId: who.assessmentId, attemptNumber: who.attemptNumber,
        attemptCreateTime: submitted.createTime, submissionTime: submitted.updateTime, activationAt: cutoff,
        definitionRevision: definition.updateTime, questions, submissionHash: submissionHash(submitted, questions),
        recordedAt: Timestamp.now(),
      };
      bindAttempt(witness, current);
      transaction.create(this.db.doc(`${REWARD_PATHS.submissions}/${key}`), { ...witness, recordedAt: FieldValue.serverTimestamp() });
    });
  }

  /** Own UID comes from verified callable context; omission is for the trusted trigger only. */
  async applyReward(attemptIdInput: string, authenticatedUid?: string): Promise<AssessmentRewardResponse> {
    this.runtime.assertDatabase(this.db);
    const attemptId = documentId(attemptIdInput);
    const key = operationId(attemptId);
    try {
      return await runGardenTransaction(this.runtime, this.db, async transaction => {
        const [control, attemptDoc, witnessDoc, receiptDoc] = await transaction.getAll(
          this.db.doc(REWARD_PATHS.control), this.db.doc(`assessment_attempts/${attemptId}`),
          this.db.doc(`${REWARD_PATHS.submissions}/${key}`), this.db.doc(`${REWARD_PATHS.receipts}/${key}`),
        );
        if (!control || !attemptDoc || !witnessDoc || !receiptDoc) throw new Error('Incomplete transaction snapshot set');
        const current = trustedSnapshot(attemptDoc);
        const who = identity(current);
        if (authenticatedUid !== undefined && who.studentId !== authenticatedUid) reject('not_attempt_owner', 'permission-denied');
        const cutoff = await this.runtime.activation(transaction, control, authenticatedUid === undefined ? 'assessment' : 'recovery', {
          studentId: who.studentId, operationId: key, attemptCreateTime: current.createTime,
        });
        const [user, gardenDoc] = await transaction.getAll(
          this.db.doc(`users/${who.studentId}`), this.db.doc(`student_gardens/${who.studentId}`),
        );
        if (!user || !gardenDoc) throw new Error('Incomplete transaction snapshot set');
        activeStudent(user.data());
        if (!after(current.createTime, cutoff)) reject('historical_attempt');
        if (!witnessDoc.exists) reject('trusted_submission_witness_required');
        const witness = parseWitness(witnessDoc.data(), key);
        if (!sameTime(witness.activationAt, cutoff)) reject('activation_epoch_conflict');
        bindAttempt(witness, current);
        if (receiptDoc.exists) {
          return { status: 'already_applied', attemptId, result: readReceipt(receiptDoc.data(), witness).result };
        }
        const garden = gardenDoc.exists ? parseGardenDocument(gardenDoc.data(), who.studentId)
          : createInitialGardenState(who.studentId);
        // Preserve streak policy; never silently move a legacy/future streak backward.
        if (garden.lastCheckInDate !== '' && garden.lastCheckInDate > witness.rewardDay) reject('out_of_order_day_requires_review');
        const result: RewardCalculation = calculateAssessmentReward(garden, witness.submissionTime.toDate());
        const receipt: AppliedAssessmentReceipt = {
          schemaVersion: 1, operationId: key, identity: witness.identity, policyVersion: 'legacy-v1',
          rewardDay: witness.rewardDay, status: 'applied', result, recordedAt: Timestamp.now(),
          attemptCreateTime: witness.attemptCreateTime, submissionTime: witness.submissionTime,
          activationAt: cutoff, submissionHash: witness.submissionHash,
        };
        const { studentId: _owner, ...progress } = result.garden;
        if (gardenDoc.exists) {
          transaction.update(gardenDoc.ref, { ...progress, updatedAt: FieldValue.serverTimestamp() });
        } else {
          transaction.create(gardenDoc.ref, { ...result.garden, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        }
        transaction.create(receiptDoc.ref, { ...receipt, recordedAt: FieldValue.serverTimestamp() });
        return { status: 'applied', attemptId, result };
      });
    } catch (error) {
      if (error instanceof GardenValidationError || error instanceof RangeError) reject('malformed_garden_or_receipt');
      throw error;
    }
  }
}
