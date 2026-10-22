import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirestoreDb, riskAlertService } from '@spartan-g/shared-services';
import { resolveStudentIdentity } from './studentIdentity';

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
  const students = await Promise.all(ids.map(async id => ({ id, role: 'student', ...await resolveStudentIdentity(facilitatorId, id) })));
  return students
    .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
}

export async function getAssignedRiskAlerts(facilitatorId: string, openOnly = false) {
  return openOnly ? riskAlertService.getOpenAlerts(facilitatorId, 'facilitator') : riskAlertService.getAlertsForFacilitator(facilitatorId, 'facilitator');
}
