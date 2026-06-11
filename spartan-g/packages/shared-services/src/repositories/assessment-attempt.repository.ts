import { COLLECTIONS, AssessmentAttemptDocument } from '@spartan-g/shared-types';
import { where, orderBy } from '../firebase/firestore';
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
}

export const assessmentAttemptRepository = new AssessmentAttemptRepository();