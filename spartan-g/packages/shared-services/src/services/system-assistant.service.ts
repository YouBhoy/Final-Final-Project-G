import { getFirebaseAuth } from '../firebase/auth';
import { useAuthStore } from '../store/auth.store';
import { createSystemAssistant } from './system-assistant';
import { gardenService } from './garden.service';
import { collection, getDocsFromServer, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/firestore';
import { COLLECTIONS, type AppointmentDocument, type AssessmentAttemptDocument, type AssessmentDefinitionDocument, type ConversationDocument } from '@spartan-g/shared-types';

// Same canonical collections/filters as the application repositories. Explicit server reads
// preserve Firebase error codes and cannot turn an empty offline cache into a verified zero.
async function records<T>(name: string, constraints: QueryConstraint[]): Promise<(T & { id: string })[]> {
  const db = getFirestoreDb();
  if (db.app.options.projectId !== getFirebaseAuth().app.options.projectId) throw new Error('Assistant project mismatch');
  const snapshot = await getDocsFromServer(query(collection(db, name), ...constraints));
  return snapshot.docs.map(d => ({ ...d.data() as T, id: d.id }));
}

// Never accept a caller/model-supplied UID. Firestore rules remain the authorization boundary.
export const systemAssistantService = createSystemAssistant({
  getIdentity: () => {
    const { session, status } = useAuthStore.getState();
    if (status !== 'authenticated' || session?.role !== 'student') return null;
    if (getFirebaseAuth().currentUser?.uid !== session.uid) return null;
    return { uid: session.uid, role: session.role, session };
  },
  getAppointments: async uid => (await records<AppointmentDocument>(COLLECTIONS.APPOINTMENTS, [where('studentId', '==', uid)])).map(record => ({
    id: record.id, studentId: record.studentId, scheduledAt: record.scheduledAt, status: record.status,
  })),
  getInProgressAssessments: async uid => (await records<AssessmentAttemptDocument>(COLLECTIONS.ASSESSMENT_ATTEMPTS, [where('studentId', '==', uid), where('status', '==', 'in_progress')])).map(record => ({
    id: record.id, studentId: record.studentId, status: record.status,
  })),
  getCompletedAssessments: async uid => (await records<AssessmentAttemptDocument>(COLLECTIONS.ASSESSMENT_ATTEMPTS, [where('studentId', '==', uid), where('status', 'in', ['submitted', 'graded'])])).map(r => ({ id: r.id, studentId: r.studentId, status: r.status })),
  getPublishedAssessments: async () => (await records<AssessmentDefinitionDocument>(COLLECTIONS.ASSESSMENTS, [where('isPublished', '==', true), orderBy('title', 'asc')])).map(r => ({ id: r.id, isPublished: r.isPublished })),
  getConversations: async uid => (await records<ConversationDocument>(COLLECTIONS.CONVERSATIONS, [where('participantIds', 'array-contains', uid), orderBy('lastMessageAt', 'desc')])).map(r => ({ id: r.id, participantIds: r.participantIds, unreadCount: r.unreadCount })),
  getGarden: async uid => {
    const result = await gardenService.loadGarden(uid);
    if (result.status === 'empty') return null;
    if (result.status === 'error') throw Object.assign(new Error('Garden unavailable'), { code: result.code === 'invalid-data' ? 'invalid' : result.code });
    const { studentId, level, xp, seeds } = result.garden;
    return { studentId, level, xp, seeds };
  },
});
