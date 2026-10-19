import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import type { QuestionContract, TrustedAttemptSnapshot } from './contracts';
import { after, identity, object, positiveInteger, questionContracts, reject } from './eligibility';

/** Shared original eligibility policy; no client status/score implies completeness. */
export async function validateSubmissionDefinition(transaction: Transaction, db: Firestore,
  attempt: TrustedAttemptSnapshot, definition: DocumentSnapshot, override: DocumentSnapshot): Promise<readonly QuestionContract[]> {
  const who = identity(attempt);
  if (!definition.exists || !definition.updateTime) reject('definition_not_found');
  const data = object(definition.data());
  if (data.isPublished !== true || Object.hasOwn(data, 'studentId')
      || typeof data.courseId !== 'string' || typeof data.facilitatorId !== 'string') reject('invalid_assessment_definition');
  if (after(definition.updateTime, attempt.createTime)) reject('definition_changed_requires_review');
  const questions = questionContracts(data.questions);
  let limit = positiveInteger(data.maxAttempts);
  if (override.exists) {
    const grant = object(override.data());
    if (!override.updateTime || after(override.updateTime, attempt.createTime)) reject('override_changed_requires_review');
    if (grant.assessmentId !== who.assessmentId || grant.studentId !== who.studentId) reject('invalid_attempt_override');
    limit = positiveInteger(grant.maxAttemptsOverride);
    if (limit > 10) reject('invalid_attempt_override');
  }
  if (who.attemptNumber > limit) reject('attempt_limit_exceeded');
  if (who.attemptNumber > 1) {
    const previous = await transaction.get(db.doc(`assessment_attempts/${who.assessmentId}_${who.studentId}_${who.attemptNumber - 1}`));
    if (!previous.exists || !previous.createTime || !previous.updateTime) reject('attempt_not_found', 'not-found');
    const earlier = { id: previous.id, path: previous.ref.path, data: object(previous.data()), createTime: previous.createTime, updateTime: previous.updateTime };
    const earlierIdentity = identity(earlier);
    if (earlierIdentity.studentId !== who.studentId || earlierIdentity.assessmentId !== who.assessmentId
        || earlierIdentity.attemptNumber !== who.attemptNumber - 1
        || (earlier.data.status !== 'submitted' && earlier.data.status !== 'graded')) reject('invalid_prior_attempt');
  }
  return questions;
}
