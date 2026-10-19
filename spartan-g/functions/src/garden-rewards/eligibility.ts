import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { parseUtcDay, utcDayFromDate } from '../garden/dates';
import { parseDocumentId } from '../garden/validation';
import {
  AssessmentRewardError, type QuestionContract, type SubmissionWitness,
  type TrustedAttemptSnapshot,
} from './contracts';

export function reject(reason: string, code: AssessmentRewardError['code'] = 'failed-precondition'): never {
  throw new AssessmentRewardError(code, reason);
}

export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('malformed_record');
  return value as Record<string, unknown>;
}

export function documentId(value: unknown): string {
  try {
    const id = parseDocumentId(value, 'identity');
    if (Buffer.byteLength(id, 'utf8') > 1500 || /^__.*__$/.test(id)) reject('invalid_identity', 'invalid-argument');
    return id;
  } catch (error) {
    if (error instanceof AssessmentRewardError) throw error;
    return reject('invalid_identity', 'invalid-argument');
  }
}

export function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) reject('invalid_attempt_number');
  return value;
}

export function stamp(value: unknown): Timestamp {
  if (!(value instanceof Timestamp)) reject('invalid_server_timestamp');
  return value;
}

export function after(a: Timestamp, b: Timestamp): boolean {
  return a.seconds > b.seconds || (a.seconds === b.seconds && a.nanoseconds > b.nanoseconds);
}

export function sameTime(a: Timestamp, b: Timestamp): boolean { return a.isEqual(b); }

export function operationId(attemptId: string): string {
  // Independent of user, epoch and policy: deleting/recreating an attempt cannot reset its receipt.
  return createHash('sha256').update(JSON.stringify(['assessment_reward', documentId(attemptId)])).digest('hex');
}

export function activeStudent(value: unknown): void {
  const data = object(value);
  if (data.role !== 'student' || data.isActive !== true) reject('active_student_required', 'permission-denied');
}

export function activation(snapshot: DocumentSnapshot): Timestamp {
  if (!snapshot.exists) reject('rewards_not_activated');
  const data = object(snapshot.data());
  if (data.enabled !== true || data.legacyClientRewardWritesBlocked !== true
      || data.policyVersion !== 'legacy-v1') reject('rewards_not_activated');
  // Use trusted document metadata, not a configured date or a serverTimestamp field.
  // The emulator confirms that a field transform need not equal document createTime.
  const cutoff = snapshot.createTime;
  // Immutable enablement: a later edit, including re-enablement, cannot backdate a cutoff.
  if (!cutoff || !snapshot.updateTime || Object.hasOwn(data, 'activatedAt')
      || !sameTime(cutoff, snapshot.updateTime)) reject('invalid_activation_boundary');
  return cutoff;
}

export function identity(snapshot: TrustedAttemptSnapshot) {
  const studentId = documentId(snapshot.data.studentId);
  const assessmentId = documentId(snapshot.data.assessmentId);
  const attemptNumber = positiveInteger(snapshot.data.attemptNumber);
  if (snapshot.id !== `${assessmentId}_${studentId}_${attemptNumber}`
      || snapshot.path !== `assessment_attempts/${snapshot.id}`) reject('attempt_identity_mismatch');
  return { studentId, assessmentId, attemptNumber };
}

export function questionContracts(value: unknown, stored = false): readonly QuestionContract[] {
  if (!Array.isArray(value) || value.length === 0) reject('invalid_assessment_definition');
  const ids = new Set<string>();
  return value.map(raw => {
    const data = object(raw);
    const id = documentId(data.id);
    if (ids.has(id)) reject('invalid_assessment_definition');
    ids.add(id);
    const type = data.type;
    if (type !== 'short_answer' && type !== 'multiple_choice' && type !== 'true_false') reject('invalid_assessment_definition');
    let optionIds: string[] = [];
    if (type !== 'short_answer') {
      const options = stored ? data.optionIds : data.options;
      if (!Array.isArray(options) || options.length === 0) reject('invalid_assessment_definition');
      optionIds = options.map(option => documentId(stored ? option : object(option).id));
      if (new Set(optionIds).size !== optionIds.length) reject('invalid_assessment_definition');
    }
    return { id, type, optionIds };
  });
}

export function submissionHash(snapshot: TrustedAttemptSnapshot, questions: readonly QuestionContract[]): string {
  const who = identity(snapshot);
  const answers = snapshot.data.answers;
  if (!Array.isArray(answers) || answers.length !== questions.length) reject('assessment_incomplete');
  const values = new Map<string, string>();
  for (const raw of answers) {
    const answer = object(raw);
    const id = documentId(answer.questionId);
    if (values.has(id) || typeof answer.value !== 'string' || answer.value === '') reject('assessment_incomplete');
    values.set(id, answer.value);
  }
  for (const question of questions) {
    const value = values.get(question.id);
    if (value === undefined || (question.type !== 'short_answer' && !question.optionIds.includes(value))) {
      reject('assessment_incomplete');
    }
  }
  // Ignore client answeredAt/submittedAt, scores, feedback and risk calculations.
  return createHash('sha256').update(JSON.stringify({ ...who, answers: [...values].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) })).digest('hex');
}

export function parseWitness(value: unknown, key: string): SubmissionWitness {
  const data = object(value);
  const who = object(data.identity);
  const attemptId = documentId(who.attemptId);
  const studentId = documentId(who.studentId);
  const assessmentId = documentId(data.assessmentId);
  const attemptNumber = positiveInteger(data.attemptNumber);
  const submissionTime = stamp(data.submissionTime);
  const attemptCreateTime = stamp(data.attemptCreateTime);
  const activationAt = stamp(data.activationAt);
  const definitionRevision = stamp(data.definitionRevision);
  let rewardDay;
  try { rewardDay = parseUtcDay(data.rewardDay); }
  catch { return reject('invalid_submission_witness'); }
  if (data.schemaVersion !== 1 || data.policyVersion !== 'legacy-v1' || who.kind !== 'assessment_reward'
      || data.operationId !== key || operationId(attemptId) !== key
      || attemptId !== `${assessmentId}_${studentId}_${attemptNumber}`
      || typeof data.submissionHash !== 'string' || !/^[a-f0-9]{64}$/.test(data.submissionHash)
      || !after(attemptCreateTime, activationAt) || !after(submissionTime, attemptCreateTime)
      || after(definitionRevision, attemptCreateTime)
      || rewardDay !== utcDayFromDate(submissionTime.toDate())) reject('invalid_submission_witness');
  return {
    schemaVersion: 1, operationId: key,
    identity: { kind: 'assessment_reward', studentId, attemptId },
    policyVersion: 'legacy-v1', rewardDay: utcDayFromDate(submissionTime.toDate()),
    assessmentId, attemptNumber, attemptCreateTime, submissionTime, activationAt, definitionRevision,
    questions: questionContracts(data.questions, true), submissionHash: data.submissionHash,
    recordedAt: stamp(data.recordedAt),
  };
}

export function bindAttempt(witness: SubmissionWitness, current: TrustedAttemptSnapshot): void {
  if (current.data.status !== 'submitted' && current.data.status !== 'graded') reject('assessment_not_submitted');
  if (current.id !== witness.identity.attemptId || current.data.studentId !== witness.identity.studentId
      || !sameTime(current.createTime, witness.attemptCreateTime)
      || after(witness.submissionTime, current.updateTime)
      || submissionHash(current, witness.questions) !== witness.submissionHash) reject('submission_changed');
}
