import { COLLECTIONS, ForestNoteDocument } from '@spartan-g/shared-types';
import {
  getFirestoreDb,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from '../firebase/firestore';

export interface SaveForestNotePayload {
  studentId: string;
  attemptId: string;
  note: string;
}

/**
 * Student-owned notes/names attached to forest trees. One doc per attempt
 * (id == attemptId), mirroring the self-owner rule pattern used by
 * student_gardens/assistant_usage. Completely separate from assessment_attempts.
 */
class ForestNoteRepository {
  async getNote(attemptId: string): Promise<(ForestNoteDocument & { id: string }) | null> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.FOREST_NOTES, attemptId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as Omit<ForestNoteDocument, 'id'>;
    return { id: docSnap.id, ...data };
  }

  /** Create-or-update the note. Creation requires studentId+attemptId match. */
  async saveNote({ studentId, attemptId, note }: SaveForestNotePayload): Promise<void> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.FOREST_NOTES, attemptId);
    const now = serverTimestamp() as Timestamp;

    const existing = await this.getNote(attemptId);
    if (existing) {
      await updateDoc(docRef, {
        note,
        updatedAt: now,
      });
      return;
    }

    await setDoc(docRef, {
      studentId,
      attemptId,
      note,
      createdAt: now,
      updatedAt: now,
    } as ForestNoteDocument);
  }

  /** Clear a note (remove the note text, keep the doc). */
  async clearNote(attemptId: string): Promise<void> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.FOREST_NOTES, attemptId);
    await updateDoc(docRef, {
      note: '',
      updatedAt: serverTimestamp(),
    });
  }
}

export const forestNoteRepository = new ForestNoteRepository();