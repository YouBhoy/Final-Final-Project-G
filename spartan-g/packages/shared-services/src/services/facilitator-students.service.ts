import { getDocFromServer, getDocsFromServer } from 'firebase/firestore';
import { COLLECTIONS } from '@spartan-g/shared-types';
import type { AssessmentAttemptDocument } from '@spartan-g/shared-types';
import { getFirebaseAuth } from '../firebase/auth';
import { getFirestoreDb, collection, doc, query, where } from '../firebase/firestore';
import { useAuthStore } from '../store/auth.store';
import { assessmentService } from './assessment.service';

type RecordData = Record<string, unknown>;
type Attempt = AssessmentAttemptDocument & { id: string };
interface Actor { uid: string; role: string; session: unknown }
export interface FacilitatorStudent {
  id: string; email: string; displayName: string; role: 'student'; isActive: boolean;
}
export interface AssessmentDisplayMetadata { title: string | null; maxAttempts: number | null }
export interface FacilitatorStudentHistory {
  student: FacilitatorStudent;
  attempts: Attempt[];
  metadata: Record<string, AssessmentDisplayMetadata>;
  metadataUnavailable: boolean;
}
export interface FacilitatorStudentsPorts {
  identity: () => Actor | null;
  user: (uid: string) => Promise<RecordData | null>;
  links: (facilitatorId: string) => Promise<RecordData[]>;
  link: (id: string) => Promise<RecordData | null>;
  attempts: (studentId: string) => Promise<Attempt[]>;
  definition: (assessmentId: string) => Promise<RecordData | null>;
}
class StudentAccessError extends Error { constructor() { super('Authorized staff access and an accepted assignment are required.'); this.name = 'StudentAccessError'; } }
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const validLink = (link: RecordData | null, facilitatorId: string, studentId: string) => !!link
  && link.id === `${facilitatorId}_${studentId}` && link.facilitatorId === facilitatorId && link.studentId === studentId && link.status === 'accepted';

export function facilitatorStudentsErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
  if (error instanceof StudentAccessError || code === 'permission-denied' || code === 'firestore/permission-denied' || /permission|insufficient|assignment/i.test(message)) {
    return 'Access unavailable. Confirm your active staff role and an accepted facilitator-student assignment. No wider student search was attempted.';
  }
  return 'Student data could not be loaded. Check your connection and try again. No records were changed.';
}

/** Read-only staff operations. No role-wide user query, fallback search, relationship creation or writes. */
export function createFacilitatorStudentsService(ports: FacilitatorStudentsPorts) {
  function assertCurrent(actor: Actor) {
    const current = ports.identity();
    if (!current || current.uid !== actor.uid || current.role !== actor.role || current.session !== actor.session) throw new StudentAccessError();
  }
  async function actor(): Promise<Actor> {
    const current = ports.identity();
    if (!current || !validId(current.uid) || !['facilitator', 'super_admin'].includes(current.role)) throw new StudentAccessError();
    const profile = await ports.user(current.uid); assertCurrent(current);
    if (!profile || profile.role !== current.role || profile.isActive !== true
      || (profile.uid !== undefined && profile.uid !== current.uid)) throw new StudentAccessError();
    return current;
  }
  async function studentFor(current: Actor, studentId: string): Promise<FacilitatorStudent | null> {
    if (!validId(studentId)) throw new StudentAccessError();
    assertCurrent(current);
    if (current.role !== 'super_admin') {
      const link = await ports.link(`${current.uid}_${studentId}`); assertCurrent(current);
      if (!validLink(link, current.uid, studentId)) throw new StudentAccessError();
    }
    const user = await ports.user(studentId); assertCurrent(current);
    if (!user || user.role !== 'student' || user.isActive !== true || (user.uid !== undefined && user.uid !== studentId)) return null;
    return { id: studentId, role: 'student', isActive: true, displayName: typeof user.displayName === 'string' ? user.displayName : '', email: typeof user.email === 'string' ? user.email : '' };
  }
  return {
    async listStudents(): Promise<{ students: FacilitatorStudent[]; unavailableCount: number }> {
      const current = await actor();
      const links = await ports.links(current.uid); assertCurrent(current);
      const ids = new Set<string>(); let unavailableCount = 0;
      for (const link of links) {
        if (validId(link.studentId) && validLink(link, current.uid, link.studentId)) ids.add(link.studentId);
        else unavailableCount++;
      }
      const students: FacilitatorStudent[] = [];
      const pending = [...ids];
      // Bound independent point reads; never convert a failed link into a directory query.
      for (let i = 0; i < pending.length; i += 4) {
        const rows = await Promise.all(pending.slice(i, i + 4).map(async id => {
          try { return await studentFor(current, id); }
          catch { assertCurrent(current); return null; }
        }));
        for (const row of rows) if (row) students.push(row); else unavailableCount++;
      }
      assertCurrent(current);
      return { students: students.sort((a, b) => a.displayName.localeCompare(b.displayName)), unavailableCount };
    },
    async getStudentHistory(studentId: string, assessmentId?: string): Promise<FacilitatorStudentHistory> {
      const current = await actor();
      const student = await studentFor(current, studentId);
      if (!student || (assessmentId !== undefined && !validId(assessmentId))) throw new StudentAccessError();
      const records = await ports.attempts(studentId); assertCurrent(current);
      if (records.some(record => record.studentId !== studentId || !['submitted', 'graded'].includes(record.status))) throw new StudentAccessError();
      const attempts = assessmentId === undefined ? records : records.filter(record => record.assessmentId === assessmentId);
      const metadata: Record<string, AssessmentDisplayMetadata> = {};
      let metadataUnavailable = false;
      const ids = [...new Set(attempts.map(attempt => attempt.assessmentId).concat(assessmentId === undefined ? [] : [assessmentId]))];
      for (const id of ids) {
        let definition: RecordData | null = null;
        if (validId(id)) {
          try { definition = await ports.definition(id); } catch { /* An unpublished/unavailable definition must not hide authorized attempts. */ }
          assertCurrent(current);
        }
        const title = typeof definition?.title === 'string' && definition.title.trim() ? definition.title : null;
        const maxAttempts = typeof definition?.maxAttempts === 'number' && Number.isInteger(definition.maxAttempts) && definition.maxAttempts > 0 ? definition.maxAttempts : null;
        if (!title) metadataUnavailable = true;
        metadata[id] = { title, maxAttempts };
      }
      assertCurrent(current);
      return { student, attempts, metadata, metadataUnavailable };
    },
  };
}

async function read(collectionName: string, id: string): Promise<RecordData | null> {
  const snapshot = await getDocFromServer(doc(getFirestoreDb(), collectionName, id));
  return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
}
export const facilitatorStudentsService = createFacilitatorStudentsService({
  identity: () => {
    const { session, status } = useAuthStore.getState();
    if (status !== 'authenticated' || !session || getFirebaseAuth().currentUser?.uid !== session.uid) return null;
    return { uid: session.uid, role: session.role, session };
  },
  user: uid => read(COLLECTIONS.USERS, uid),
  link: id => read(COLLECTIONS.FACILITATOR_STUDENT_LINKS, id),
  links: async facilitatorId => {
    const snapshot = await getDocsFromServer(query(collection(getFirestoreDb(), COLLECTIONS.FACILITATOR_STUDENT_LINKS), where('facilitatorId', '==', facilitatorId), where('status', '==', 'accepted')));
    return snapshot.docs.map(row => ({ ...row.data(), id: row.id }));
  },
  attempts: studentId => assessmentService.getAttemptsByStudent(studentId),
  definition: id => read(COLLECTIONS.ASSESSMENTS, id),
});
