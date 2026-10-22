import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { createPseudonymizer } from './pseudonymization';

const alias = createPseudonymizer();
export function studentAlias(facilitatorId: string, studentId: string) {
  return alias('Student', JSON.stringify([facilitatorId, studentId]));
}

/** Consent is student-written; Firestore additionally requires an accepted relationship. */
export async function resolveStudentIdentity(facilitatorId: string, studentId: string) {
  const hidden = { displayName: studentAlias(facilitatorId, studentId), email: 'Identity not shared', identityShared: false };
  try {
    const consent = (await getDocFromServer(doc(db, 'student_identity_consents', `${facilitatorId}_${studentId}`))).data();
    if (consent?.studentId !== studentId || consent.facilitatorId !== facilitatorId) return hidden;
    const student = (await getDocFromServer(doc(db, 'users', studentId))).data();
    if (student?.role !== 'student' || student.isActive !== true) return hidden;
    return { displayName: student.displayName || hidden.displayName, email: student.email || 'Email unavailable', identityShared: true };
  } catch { return hidden; }
}
