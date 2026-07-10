import {
  COLLECTIONS,
  AssessmentDocument,
  AssessmentDefinitionDocument,
} from '@spartan-g/shared-types';
import { where, orderBy, limit, onSnapshot, query, Unsubscribe } from '../firebase/firestore';
import { getFirestoreDb } from '../firebase/firestore';
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

  /**
   * Phase 3B — Get all published assessment definitions (visible to students).
   * Returns documents from the `assessments` collection where isPublished == true.
   */
  async getPublished(): Promise<(AssessmentDefinitionDocument & { id: string })[]> {
    const all = await this.getAll([where('isPublished', '==', true), orderBy('title', 'asc')]);
    return all.map((doc) => ({
      id: doc.id,
      ...(doc as unknown as Omit<AssessmentDefinitionDocument, 'id'>),
    }));
  }

  /**
   * Phase 3B — Subscribe to published assessment definitions in real-time.
   * Returns an unsubscribe function. The callback fires with the latest list.
   */
  subscribePublished(
    callback: (data: (AssessmentDefinitionDocument & { id: string })[]) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe {
    const q = query(
      this.getCollectionRef(),
      where('isPublished', '==', true),
      orderBy('title', 'asc'),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const items: (AssessmentDefinitionDocument & { id: string })[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...(d.data() as Omit<AssessmentDefinitionDocument, 'id'>) });
        });
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
      },
    );
  }
}

export const assessmentRepository = new AssessmentRepository();
