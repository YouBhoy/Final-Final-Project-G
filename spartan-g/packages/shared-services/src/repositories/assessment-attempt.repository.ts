import { COLLECTIONS, AssessmentAttemptDocument } from '@spartan-g/shared-types';
import { where, orderBy, limit } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class AssessmentAttemptRepository extends BaseRepository<AssessmentAttemptDocument> {
  constructor() {
    super(COLLECTIONS.ASSESSMENT_ATTEMPTS);
  }

  async getAttemptsForStudent(
    assessmentId: string,
    studentId: string,
  ): Promise<(AssessmentAttemptDocument & { id: string })[]> {
    return this.getAll([
      where('assessmentId', '==', assessmentId),
      where('studentId', '==', studentId),
      orderBy('attemptNumber', 'asc'),
    ]);
  }

  async getInProgressAttempt(
    assessmentId: string,
    studentId: string,
  ): Promise<(AssessmentAttemptDocument & { id: string }) | null> {
    const results = await this.getAll([
      where('assessmentId', '==', assessmentId),
      where('studentId', '==', studentId),
      where('status', '==', 'in_progress'),
      limit(1),
    ]);
    return results[0] ?? null;
  }
}

export const assessmentAttemptRepository = new AssessmentAttemptRepository();
