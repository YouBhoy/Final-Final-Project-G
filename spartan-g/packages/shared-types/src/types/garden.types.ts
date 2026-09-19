import { Timestamp } from 'firebase/firestore';
import { FirestoreDocument } from './firestore.types';

export interface StudentGardenDocument extends FirestoreDocument {
  studentId: string;
  level: number;
  xp: number;
  seeds: number;
  streakCount: number;
  lastCheckInDate: string; // 'YYYY-MM-DD'
  /**
   * Date of the student's most recent daily watering ('YYYY-MM-DD').
   * Separate from lastCheckInDate (which stays tied to assessment
   * submissions). Empty string when never watered.
   */
  lastWateredDate: string; // 'YYYY-MM-DD'
  createdAt: Timestamp;
  updatedAt: Timestamp;
}