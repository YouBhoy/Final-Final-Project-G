import { COLLECTIONS, AssessmentDocument } from '@spartan-g/shared-types';
import { BaseRepository } from './base.repository';

class AssessmentRepository extends BaseRepository<AssessmentDocument> {
  constructor() {
    super(COLLECTIONS.ASSESSMENTS);
  }
}

export const assessmentRepository = new AssessmentRepository();