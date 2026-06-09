import {
  COLLECTIONS,
  AssessmentDocument,
} from '@spartan-g/shared-types';
import { where, orderBy } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class AssessmentRepository extends BaseRepository<AssessmentDocument> {
  constructor() {
    super(COLLECTIONS.ASSESSMENTS);
  }

  /** All assessment attempts a student has made. */
  async getByStudent(
    studentId: string,
  ): Promise<(AssessmentDocument & { id: string })[]> {
    return this.getAll([
      where('studentId', '==', studentId),
      orderBy('updatedAt', 'desc'),
    ]);
  }

  /** All attempts for a given template (used by facilitators/admins later). */
  async getByTemplate(
    templateId: string,
  ): Promise<(AssessmentDocument & { id: string })[]> {
    return this.getAll([
      where('templateId', '==', templateId),
      orderBy('updatedAt', 'desc'),
    ]);
  }
}

export const assessmentRepository = new AssessmentRepository();
