import { forestNoteRepository, SaveForestNotePayload } from '../repositories/forest-note.repository';

class ForestNoteService {
  /** Fetch the saved note for an attempt, or null if none. Never throws. */
  async getNote(attemptId: string) {
    try {
      return await forestNoteRepository.getNote(attemptId);
    } catch (err) {
      console.error('[ForestNoteService] getNote failed:', err);
      return null;
    }
  }

  /** Save (create or update) a note for an attempt. Best-effort, never throws. */
  async saveNote(payload: SaveForestNotePayload): Promise<boolean> {
    try {
      await forestNoteRepository.saveNote(payload);
      return true;
    } catch (err) {
      console.error('[ForestNoteService] saveNote failed:', err);
      return false;
    }
  }
}

export const forestNoteService = new ForestNoteService();
export type { SaveForestNotePayload } from '../repositories/forest-note.repository';