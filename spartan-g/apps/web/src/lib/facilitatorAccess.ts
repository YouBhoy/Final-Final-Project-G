import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirestoreDb, userRepository } from '@spartan-g/shared-services';
import type { RiskAlertDocument, UserDocument } from '@spartan-g/shared-types';

/** Query approved relationships first; never download the global student directory. */
async function assignedStudentIds(facilitatorId: string): Promise<string[]> {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), 'facilitator_student_links'),
    where('facilitatorId', '==', facilitatorId), where('status', '==', 'accepted')));
  return [...new Set(snapshot.docs.flatMap(doc => {
    const link = doc.data();
    return typeof link.studentId === 'string' && doc.id === `${facilitatorId}_${link.studentId}`
      ? [link.studentId] : [];
  }))];
}

export async function getAssignedStudents(facilitatorId: string) {
  const ids = await assignedStudentIds(facilitatorId);
  const students = await Promise.all(ids.map(id => userRepository.getById(id)));
  return students.filter((student): student is UserDocument & { id: string } =>
    student !== null && student.role === 'student' && student.isActive)
    .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
}

export async function getAssignedRiskAlerts(facilitatorId: string, openOnly = false) {
  const ids = await assignedStudentIds(facilitatorId);
  const results = await Promise.all(ids.map(async studentId => {
    const filters = [where('facilitatorId', '==', facilitatorId), where('studentId', '==', studentId)];
    if (openOnly) filters.push(where('status', '==', 'open'));
    const snapshot = await getDocs(query(collection(getFirestoreDb(), 'risk_alerts'), ...filters));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as RiskAlertDocument & { id: string }));
  }));
  return results.flat().sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
}
