import { COLLECTIONS, StudentGardenDocument } from '@spartan-g/shared-types';
import { getFirestoreDb, doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from '../firebase/firestore';
import { increment } from 'firebase/firestore';

class GardenRepository {
  async getGarden(studentId: string): Promise<(StudentGardenDocument & { id: string }) | null> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.STUDENT_GARDENS, studentId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as Omit<StudentGardenDocument, 'id'>;
    return { id: docSnap.id, ...data };
  }

  async createGarden(studentId: string): Promise<void> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.STUDENT_GARDENS, studentId);
    const now = serverTimestamp() as Timestamp;
    await setDoc(docRef, {
      studentId,
      level: 1,
      xp: 0,
      seeds: 0,
      streakCount: 0,
      lastCheckInDate: '',
      createdAt: now,
      updatedAt: now,
    } as StudentGardenDocument);
  }

  async incrementReward(
    studentId: string,
    xpGain: number,
    seedsGain: number,
    lastCheckInDate: string,
    streakCount: number,
  ): Promise<void> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.STUDENT_GARDENS, studentId);
    await updateDoc(docRef, {
      xp: increment(xpGain),
      seeds: increment(seedsGain),
      lastCheckInDate,
      streakCount,
      updatedAt: serverTimestamp(),
    });
  }

  // Level-up: overwrite xp, level after adjusting for level-up threshold
  async applyLevelUp(studentId: string, newLevel: number, remainingXp: number): Promise<void> {
    const db = getFirestoreDb();
    const docRef = doc(db, COLLECTIONS.STUDENT_GARDENS, studentId);
    await updateDoc(docRef, {
      level: newLevel,
      xp: remainingXp,
      updatedAt: serverTimestamp(),
    });
  }
}

export const gardenRepository = new GardenRepository();