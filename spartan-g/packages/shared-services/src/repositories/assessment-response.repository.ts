import {
  COLLECTIONS,
  AssessmentResponseDocument,
} from '@spartan-g/shared-types';
import { where, orderBy, writeBatch, doc, getFirestoreDb, serverTimestamp } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class AssessmentResponseRepository extends BaseRepository<AssessmentResponseDocument> {
  constructor() {
    super(COLLECTIONS.ASSESSMENT_RESPONSES);
  }

  /** All responses for a given assessment, ordered by question order (questionId used as tiebreaker). */
  async getByAssessment(
    assessmentId: string,
  ): Promise<(AssessmentResponseDocument & { id: string })[]> {
    return this.getAll([
      where('assessmentId', '==', assessmentId),
      orderBy('questionId', 'asc'),
    ]);
  }

  /** Get a single response for a specific question in a specific assessment. */
  async getByAssessmentAndQuestion(
    assessmentId: string,
    questionId: string,
  ): Promise<(AssessmentResponseDocument & { id: string }) | null> {
    const results = await this.getAll([
      where('assessmentId', '==', assessmentId),
      where('questionId', '==', questionId),
    ]);
    return results.length > 0 ? results[0] : null;
  }

  /** Get all responses for a specific student across all their assessments. */
  async getByStudent(
    studentId: string,
  ): Promise<(AssessmentResponseDocument & { id: string })[]> {
    return this.getAll([
      where('studentId', '==', studentId),
      orderBy('assessmentId', 'asc'),
    ]);
  }

  /**
   * Batch upsert responses for an assessment.
   * If a response already exists (matched by assessmentId + questionId), it is updated.
   * Otherwise, a new response is created.
   * This is used by both auto-save and final submit.
   */
  async upsertResponses(
    responses: Omit<AssessmentResponseDocument, 'id' | 'createdAt' | 'updatedAt'>[],
  ): Promise<void> {
    if (responses.length === 0) return;

    const db = getFirestoreDb();
    const batch = writeBatch(db);

    for (const response of responses) {
      const existing = await this.getByAssessmentAndQuestion(
        response.assessmentId,
        response.questionId,
      );

      if (existing) {
        batch.update(doc(db, COLLECTIONS.ASSESSMENT_RESPONSES, existing.id), {
          value: response.value,
          updatedAt: serverTimestamp(),
        });
      } else {
        const newRef = doc(db, COLLECTIONS.ASSESSMENT_RESPONSES);
        batch.set(newRef, {
          ...response,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  }
}

export const assessmentResponseRepository = new AssessmentResponseRepository();