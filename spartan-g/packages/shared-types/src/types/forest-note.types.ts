import { Timestamp } from 'firebase/firestore';
import { FirestoreDocument } from './firestore.types';

/**
 * A short, student-owned note/name attached to a forest tree.
 * Stored in `forest_notes/{attemptId}` — entirely separate from the
 * assessment_attempts document itself (no changes to that collection).
 */
export interface ForestNoteDocument extends FirestoreDocument {
  studentId: string;
  /** The assessment attempt this note is attached to == the doc id. */
  attemptId: string;
  note: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}