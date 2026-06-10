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
import { assessmentQuestionRepository } from '../repositories/assessment-question.repository';
import { assessmentResponseRepository } from '../repositories/assessment-response.repository';

class AssessmentService {
  /** All attempts a student has made. */
  async getMyAssessments(studentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_ASSESSMENTS)) {
      throw new PermissionError();
    }
    return assessmentRepository.getByStudent(studentId);
  }

  /** All in-progress attempts (for resume list). */
  async getMyInProgressAssessments(studentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.TAKE_ASSESSMENTS)) {
      throw new PermissionError();
    }
    return assessmentRepository.getInProgressByStudent(studentId);
  }

  async getAssessment(assessmentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_ASSESSMENTS)) {
      throw new PermissionError();
    }
    return assessmentRepository.getById(assessmentId);
  }

  /**
   * Begin a new assessment attempt for the given template.
   * If the student already has an in-progress attempt, returns its ID (resume).
   * Otherwise creates a new shell document.
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

    // Resume: check for an existing in-progress attempt
    const existing = await assessmentRepository.getInProgressByStudentAndTemplate(
      studentId,
      templateId,
    );
    if (existing) {
      return existing.id;
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

  /** Mark an attempt as submitted. Validates all required questions have responses. */
  async submitAssessment(assessmentId: string, studentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.TAKE_ASSESSMENTS)) {
      throw new PermissionError();
    }

    const assessment = await assessmentRepository.getById(assessmentId);
    if (!assessment) throw new Error('Assessment not found');
    if (assessment.studentId !== studentId) {
      throw new Error('You can only submit your own assessments');
    }
    if (assessment.status !== 'in_progress') {
      throw new Error('This assessment has already been submitted');
    }

    // Validate all required questions have responses
    const questions = await assessmentQuestionRepository.getByTemplate(assessment.templateId);
    const requiredQuestions = questions.filter((q) => q.isRequired);
    const responses = await assessmentResponseRepository.getByAssessment(assessmentId);
    const answeredQuestionIds = new Set(responses.map((r) => r.questionId));

    const unansweredRequired = requiredQuestions.filter(
      (q) => !answeredQuestionIds.has(q.id),
    );

    if (unansweredRequired.length > 0) {
      const prompts = unansweredRequired.map((q) => `"${q.prompt}"`).join(', ');
      throw new Error(
        `Please answer all required questions before submitting. Missing: ${prompts}`,
      );
    }

    await assessmentRepository.update(assessmentId, {
      status: 'submitted',
      submittedAt: Timestamp.now(),
      responseCount: responses.length,
    } as Partial<AssessmentDocument>);
  }
}

export const assessmentService = new AssessmentService();
