import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { AssessmentRewardProcessor, trustedSnapshot } from '../garden-rewards/processor';
import { validateSubmissionDefinition } from '../garden-rewards/definition';
import { REWARD_PATHS, type SubmissionWitness } from '../garden-rewards/contracts';
import { activeStudent, after, bindAttempt, documentId, identity, operationId, parseWitness, reject, sameTime, submissionHash } from '../garden-rewards/eligibility';
import { runGardenTransaction, type GardenRuntime } from '../garden-rewards/runtime';
import { exact } from '../garden-production/rollout';

export const OUTBOX = 'garden_submission_outbox';
const fields = ['schemaVersion', 'operationId', 'identity', 'policyVersion', 'attemptCreateTime',
  'beforeUpdateTime', 'activationAt', 'definitionRevision', 'questions', 'submissionHash'];

/** Only authentic stored drafts enter here. No event snapshots are accepted from callers. */
export class GardenFinalizer {
  readonly rewards: AssessmentRewardProcessor;
  constructor(private readonly db: Firestore, private readonly runtime: GardenRuntime) {
    runtime.assertDatabase(db); this.rewards = new AssessmentRewardProcessor(db, runtime);
  }

  async submit(uid: string, input: string): Promise<boolean> {
    this.runtime.assertDatabase(this.db);
    const attemptId = documentId(input), key = operationId(attemptId);
    return runGardenTransaction(this.runtime, this.db, async tx => {
      const [attemptDoc, epoch, user, outbox, witness, receipt] = await tx.getAll(
        this.db.doc(`assessment_attempts/${attemptId}`), this.db.doc(REWARD_PATHS.control), this.db.doc(`users/${uid}`),
        this.db.doc(`${OUTBOX}/${key}`), this.db.doc(`${REWARD_PATHS.submissions}/${key}`), this.db.doc(`${REWARD_PATHS.receipts}/${key}`));
      if (!attemptDoc || !epoch || !user || !outbox || !witness || !receipt) throw Error('Incomplete snapshot set');
      const current = trustedSnapshot(attemptDoc), who = identity(current);
      if (who.studentId !== uid) reject('not_attempt_owner', 'permission-denied');
      activeStudent(user.data());
      const cutoff = await this.runtime.activation(tx, epoch, 'capture', {
        studentId: uid, operationId: key, attemptCreateTime: current.createTime, submissionTime: Timestamp.now(),
      });
      if (!after(current.createTime, cutoff)) reject('historical_attempt');
      if (current.data.status === 'submitted' || current.data.status === 'graded') {
        if (!outbox.exists && !witness.exists) reject('submission_not_server_finalized');
        return false; // Existing evidence is checked by materialize/apply, never recreated here.
      }
      if (current.data.status !== 'in_progress') reject('assessment_not_in_progress');
      if (outbox.exists || witness.exists || receipt.exists) reject('submission_evidence_conflict');
      const [definition, override] = await tx.getAll(this.db.doc(`assessments/${who.assessmentId}`),
        this.db.doc(`assessment_overrides/${who.assessmentId}_${uid}`));
      if (!definition || !override) throw Error('Incomplete definition set');
      const questions = await validateSubmissionDefinition(tx, this.db, current, definition, override);
      const hash = submissionHash(current, questions);
      if (!definition.updateTime) reject('definition_not_found');
      tx.create(outbox.ref, { schemaVersion: 1, operationId: key,
        identity: { kind: 'assessment_reward', studentId: uid, attemptId }, policyVersion: 'legacy-v1',
        attemptCreateTime: current.createTime, beforeUpdateTime: current.updateTime, activationAt: cutoff,
        definitionRevision: definition.updateTime, questions, submissionHash: hash });
      tx.update(attemptDoc.ref, { status: 'submitted', submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
  }

  /** Reconstruct the unchanged witness schema from immutable, atomically committed server evidence. */
  async materialize(uid: string, input: string): Promise<void> {
    this.runtime.assertDatabase(this.db);
    const attemptId = documentId(input), key = operationId(attemptId);
    await runGardenTransaction(this.runtime, this.db, async tx => {
      const [attemptDoc, outbox, witnessDoc, epoch, user] = await tx.getAll(
        this.db.doc(`assessment_attempts/${attemptId}`), this.db.doc(`${OUTBOX}/${key}`),
        this.db.doc(`${REWARD_PATHS.submissions}/${key}`), this.db.doc(REWARD_PATHS.control), this.db.doc(`users/${uid}`));
      if (!attemptDoc || !outbox || !witnessDoc || !epoch || !user) throw Error('Incomplete snapshot set');
      const current = trustedSnapshot(attemptDoc), who = identity(current);
      if (who.studentId !== uid) reject('not_attempt_owner', 'permission-denied');
      activeStudent(user.data());
      // Absent outbox cannot be invented from a client-submitted completed record.
      if (!outbox.exists) {
        if (!witnessDoc.exists) reject('trusted_submission_witness_required');
        const old = parseWitness(witnessDoc.data(), key); bindAttempt(old, current);
        await this.runtime.activation(tx, epoch, 'capture', { studentId:uid, operationId:key,
          attemptCreateTime:current.createTime, submissionTime:old.submissionTime });
        return;
      }
      if (!outbox.createTime || !outbox.updateTime || !sameTime(outbox.createTime, outbox.updateTime)) reject('outbox_conflict');
      const data = exact(outbox.data(), fields);
      const cutoff = await this.runtime.activation(tx, epoch, 'capture', { studentId:uid, operationId:key,
        attemptCreateTime:current.createTime, submissionTime:outbox.createTime });
      const submissionTime = outbox.createTime;
      if (!(data.beforeUpdateTime instanceof Timestamp) || !after(submissionTime, data.beforeUpdateTime)
          || !(data.activationAt instanceof Timestamp) || !sameTime(data.activationAt, cutoff)) reject('outbox_conflict');
      const parsed: SubmissionWitness = parseWitness({ ...data, rewardDay:submissionTime.toDate().toISOString().slice(0,10),
        submissionTime, assessmentId:who.assessmentId, attemptNumber:who.attemptNumber, recordedAt:submissionTime }, key);
      bindAttempt(parsed, current);
      if (parsed.identity.studentId !== uid) reject('not_attempt_owner', 'permission-denied');
      if (witnessDoc.exists) {
        const old = parseWitness(witnessDoc.data(), key);
        if (!sameTime(old.submissionTime, parsed.submissionTime) || old.submissionHash !== parsed.submissionHash
            || !sameTime(old.activationAt, parsed.activationAt)) reject('witness_conflict');
        bindAttempt(old, current); return;
      }
      tx.create(witnessDoc.ref, { ...parsed, recordedAt:FieldValue.serverTimestamp() });
    });
  }

  async recover(uid: string, attemptId: string) {
    await this.materialize(uid, attemptId);
    return this.rewards.applyReward(attemptId, uid);
  }
}
