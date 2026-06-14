import {
  COLLECTIONS,
  AssessmentQuestionDocument,
} from '@spartan-g/shared-types';
import { where, orderBy, writeBatch, doc, getFirestoreDb } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class AssessmentQuestionRepository extends BaseRepository<AssessmentQuestionDocument> {
  constructor() {
    super(COLLECTIONS.ASSESSMENT_QUESTIONS);
  }

  /** All questions for a template, ordered by their `order` field. */
  async getByTemplate(
    templateId: string,
  ): Promise<(AssessmentQuestionDocument & { id: string })[]> {
    return this.getAll([
      where('templateId', '==', templateId),
      orderBy('order', 'asc'),
    ]);
  }

  /**
   * Replace all questions for a template in a single batch.
   * Used when an admin saves a template: existing questions are deleted
   * and the new set is written. Cheaper than diffing for Phase 3A.
   */
  async replaceForTemplate(
    templateId: string,
    questions: Omit<AssessmentQuestionDocument, 'id' | 'templateId' | 'createdAt' | 'updatedAt'>[],
  ): Promise<void> {
    const db = getFirestoreDb();
    const batch = writeBatch(db);

    const existing = await this.getByTemplate(templateId);
    for (const q of existing) {
      batch.delete(doc(db, COLLECTIONS.ASSESSMENT_QUESTIONS, q.id));
    }

    questions.forEach((q, index) => {
      const newRef = doc(db, COLLECTIONS.ASSESSMENT_QUESTIONS);
      batch.set(newRef, {
        ...q,
        templateId,
        order: q.order ?? index,
      });
    });

    await batch.commit();
  }
}

export const assessmentQuestionRepository = new AssessmentQuestionRepository();
