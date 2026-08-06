import { Timestamp } from 'firebase/firestore';
import { FirestoreDocument } from './firestore.types';

export interface StudentGardenDocument extends FirestoreDocument {
  studentId: string;
  level: number;
  xp: number;
  seeds: number;
  streakCount: number;
  lastCheckInDate: string; // 'YYYY-MM-DD'
  createdAt: Timestamp;
  updatedAt: Timestamp;
}