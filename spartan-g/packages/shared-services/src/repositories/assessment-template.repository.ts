import {
  COLLECTIONS,
  AssessmentTemplateDocument,
} from '@spartan-g/shared-types';
import { where, orderBy, QueryConstraint } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class AssessmentTemplateRepository extends BaseRepository<AssessmentTemplateDocument> {
  constructor() {
    super(COLLECTIONS.ASSESSMENT_TEMPLATES);
  }

  /** All templates regardless of active state — used in the admin list. */
  async getAllTemplates(): Promise<(AssessmentTemplateDocument & { id: string })[]> {
    return this.getAll([orderBy('updatedAt', 'desc')]);
  }

  /** Templates currently published to students. */
  async getActiveTemplates(
    constraints: QueryConstraint[] = [],
  ): Promise<(AssessmentTemplateDocument & { id: string })[]> {
    return this.getAll([where('isActive', '==', true), ...constraints]);
  }

  /** Filter by category. */
  async getByCategory(
    category: string,
  ): Promise<(AssessmentTemplateDocument & { id: string })[]> {
    return this.getAll([
      where('category', '==', category),
      where('isActive', '==', true),
      orderBy('title', 'asc'),
    ]);
  }
}

export const assessmentTemplateRepository = new AssessmentTemplateRepository();
