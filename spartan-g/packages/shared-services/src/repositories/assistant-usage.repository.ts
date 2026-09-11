import { COLLECTIONS } from '@spartan-g/shared-types';
import { getFirestoreDb, doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from '../firebase/firestore';
import { increment } from 'firebase/firestore';

export interface AssistantUsageDocument {
  studentId: string;
  /** Date bucket this counter belongs to: local 'YYYY-MM-DD'. */
  date: string;
  /** Number of messages sent today by this student. */
  count: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Per-student daily counter backing the AI assistant's ~40 msgs/day cap.
 * One doc per student, id == studentId — mirrors the self-owner rule
 * pattern used by `student_gardens`, so no fetch/update hits another user.
 */
class AssistantUsageRepository {
  async getUsage(studentId: string): Promise<(AssistantUsageDocument & { id: string }) | null> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.ASSISTANT_USAGE, studentId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as Omit<AssistantUsageDocument, 'id'>;
    return { id: docSnap.id, ...data };
  }

  async createUsage(studentId: string, date: string, count: number): Promise<void> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.ASSISTANT_USAGE, studentId);
    const now = serverTimestamp() as Timestamp;
    await setDoc(docRef, {
      studentId,
      date,
      count,
      createdAt: now,
      updatedAt: now,
    } as AssistantUsageDocument);
  }

  /** Increment today's counter by `by` (default 1). */
  async incrementUsage(studentId: string, by = 1): Promise<void> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.ASSISTANT_USAGE, studentId);
    await updateDoc(docRef, {
      count: increment(by),
      updatedAt: serverTimestamp(),
    });
  }

  /** Overwrite the counter (used when a new day starts). */
  async resetUsage(studentId: string, date: string): Promise<void> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.ASSISTANT_USAGE, studentId);
    await updateDoc(docRef, {
      date,
      count: 0,
      updatedAt: serverTimestamp(),
    });
  }
}

export const assistantUsageRepository = new AssistantUsageRepository();