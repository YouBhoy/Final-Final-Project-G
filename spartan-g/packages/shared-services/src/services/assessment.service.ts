import {
  PERMISSIONS,
  Role,
  PermissionError,
  hasPermission,
  AssessmentDocument,
} from '@spartan-g/shared-types';
import { Timestamp } from '../firebase/firestore';
import { assessmentRepository } from '../repositories/assessment.repository';
import { assessmentTemplateRepository } from '../repositories/assessment-template.repository';

class AssessmentService {
  /** All attempts a student has made. */
  async getMyAssessments(studentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_ASSESSMENTS)) {
      throw new PermissionError();
    }
    return assessmentRepository.getByStudent(studentId);
  }

  async getAssessment(assessmentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_ASSESSMENTS)) {
      throw new PermissionError();
    }
    return assessmentRepository.getById(assessmentId);
  }

  /**
   * Begin a new assessment attempt for the given template.
   * Phase 3A: we do not store any responses yet \u2014 this only creates the
   * shell document. Scoring and analytics come in a later phase.
   */
  async startAssessment(templateId: string, studentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.TAKE_ASSESSMENTS)) {
      throw new PermissionError();
    }

    const template = await assessmentTemplateRepository.getById(templateId);
    if (!template) {
      throw new Error(`Assessment template not found: ${templateId}`);
    }
    if (!template.isActive) {
      throw new Error('This assessment is not currently available');
    }

    const id = `asmt_${studentId}_${templateId}_${Date.now()}`;
    await assessmentRepository.create(id, {
      templateId,
      studentId,
      status: 'in_progress',
      responseCount: 0,
    } as AssessmentDocument);

    return id;
  }

  /** Mark an attempt as submitted. No responses are persisted yet. */
  async submitAssessment(assessmentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.TAKE_ASSESSMENTS)) {
      throw new PermissionError();
    }
    await assessmentRepository.update(assessmentId, {
      status: 'submitted',
      submittedAt: Timestamp.now(),
    } as Partial<AssessmentDocument>);
  }
}

export const assessmentService = new AssessmentService();
