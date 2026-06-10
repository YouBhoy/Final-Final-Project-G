import {
  COLLECTIONS,
  AssessmentDocument,
} from '@spartan-g/shared-types';
import { where, orderBy, limit } from '../firebase/firestore';
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

  /** Find the latest in-progress assessment for a student+template (used for resume). */
  async getInProgressByStudentAndTemplate(
    studentId: string,
    templateId: string,
  ): Promise<(AssessmentDocument & { id: string }) | null> {
    const results = await this.getAll([
      where('studentId', '==', studentId),
      where('templateId', '==', templateId),
      where('status', '==', 'in_progress'),
      orderBy('updatedAt', 'desc'),
      limit(1),
    ]);
    return results.length > 0 ? results[0] : null;
  }

  /** All in-progress assessments for a student (for dashboard/resume list). */
  async getInProgressByStudent(
    studentId: string,
  ): Promise<(AssessmentDocument & { id: string })[]> {
    return this.getAll([
      where('studentId', '==', studentId),
      where('status', '==', 'in_progress'),
      orderBy('updatedAt', 'desc'),
    ]);
  }
}

export const assessmentRepository = new AssessmentRepository();
