import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();

const pick = (data: Record<string, unknown>, keys: string[]) => Object.fromEntries(
  keys.filter(key => data[key] !== undefined).map(key => [key, data[key]]),
);

/** The mixed collection must never expose student instances through publication. */
export async function listPublishedDefinitions(db: Firestore, uid: string) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = (await db.doc(`users/${uid}`).get()).data();
  if (caller?.isActive !== true) throw new HttpsError('permission-denied', 'Active account required.');
  const snapshot = await db.collection('assessments').where('isPublished', '==', true).get();
  const assessments = snapshot.docs.flatMap(doc => {
    const data = doc.data();
    if ('studentId' in data || typeof data.courseId !== 'string' || !data.courseId) return [];
    const questions = (Array.isArray(data.questions) ? data.questions : []).map(question => ({
      ...pick(question, ['id', 'type', 'text', 'points', 'order']),
      ...(Array.isArray(question.options) ? { options: question.options.map((option: Record<string, unknown>) => pick(option, ['id', 'label'])) } : {}),
    }));
    return [{ ...pick(data, ['courseId', 'title', 'description', 'instructions', 'timeLimitMinutes',
      'maxAttempts', 'isPublished', 'facilitatorId', 'passingScore']), id: doc.id, questions }];
  });
  return { assessments };
}

export const getPublishedAssessmentDefinitions = onCall({ region: 'us-central1', cors: true }, request =>
  listPublishedDefinitions(getFirestore(), request.auth?.uid ?? ''),
);
