import {
  PERMISSIONS,
  Role,
  PermissionError,
  hasPermission,
  AssessmentDocument,
  AssessmentAttemptDocument,
  AssessmentAnswer,
  AssessmentDefinitionDocument,
} from '@spartan-g/shared-types';
import { Timestamp, serverTimestamp, where } from '../firebase/firestore';
import { assessmentRepository } from '../repositories/assessment.repository';
import { assessmentTemplateRepository } from '../repositories/assessment-template.repository';
import { assessmentQuestionRepository } from '../repositories/assessment-question.repository';
import { assessmentResponseRepository } from '../repositories/assessment-response.repository';
import { assessmentAttemptRepository } from '../repositories/assessment-attempt.repository';

class AssessmentService {
  // =================== Phase 3A Methods (Template-based assessments) ===================

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

  // =================== Phase 3B Methods (Course-based assessment attempts) ===================

  /** Get a Phase 3B assessment definition document. */
  async getAssessmentDefinition(assessmentId: string): Promise<(AssessmentDefinitionDocument & { id: string }) | null> {
    return this.getAssessment(assessmentId, 'student' as Role) as unknown as (AssessmentDefinitionDocument & { id: string }) | null;
  }

  async getAttempt(attemptId: string): Promise<(AssessmentAttemptDocument & { id: string }) | null> {
    return assessmentAttemptRepository.getById(attemptId);
  }

  async getStudentAttempts(
    assessmentId: string,
    studentId: string,
  ): Promise<(AssessmentAttemptDocument & { id: string })[]> {
    return assessmentAttemptRepository.getAttemptsForStudent(assessmentId, studentId);
  }

  async getInProgressAttempt(assessmentId: string, studentId: string): Promise<string | null> {
    const attempt = await assessmentAttemptRepository.getInProgressAttempt(assessmentId, studentId);
    return attempt?.id ?? null;
  }

  async getAttemptCount(assessmentId: string, studentId: string): Promise<number> {
    const attempts = await assessmentAttemptRepository.getAll([
      where('assessmentId', '==', assessmentId),
      where('studentId', '==', studentId),
      where('status', 'in', ['submitted', 'graded']),
    ]);
    return attempts.length;
  }

  async startAttempt(assessmentId: string, studentId: string): Promise<string> {
    const assessment = await this.getAssessment(assessmentId, studentId as unknown as Role);
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    const attemptCount = await this.getAttemptCount(assessmentId, studentId);
    if (attemptCount >= (assessment as any).maxAttempts) {
      throw new Error('Maximum number of attempts reached');
    }

    const now = serverTimestamp() as Timestamp;
    const attemptId = `${assessmentId}_${studentId}_${attemptCount + 1}`;

    await assessmentAttemptRepository.create(attemptId, {
      assessmentId,
      studentId,
      answers: [],
      status: 'in_progress',
      startedAt: now,
      attemptNumber: attemptCount + 1,
    } as AssessmentAttemptDocument);

    return attemptId;
  }

  async saveAnswer(attemptId: string, answer: AssessmentAnswer): Promise<void> {
    const attempt = await this.getAttempt(attemptId);
    if (!attempt) {
      throw new Error('Attempt not found');
    }
    if (attempt.status !== 'in_progress') {
      throw new Error('Cannot modify a submitted or graded attempt');
    }

    // Replace serverTimestamp() sentinel with a plain Date (serverTimestamp() is not supported inside arrays)
    const safeAnswer: AssessmentAnswer = {
      ...answer,
      answeredAt: new Date() as unknown as Timestamp,
    };

    // Upsert: replace answer if question already answered, append if new
    const existingIndex = attempt.answers.findIndex(
      (a: AssessmentAnswer) => a.questionId === answer.questionId,
    );

    let updatedAnswers: AssessmentAnswer[];
    if (existingIndex >= 0) {
      updatedAnswers = [...attempt.answers];
      updatedAnswers[existingIndex] = safeAnswer;
    } else {
      updatedAnswers = [...attempt.answers, safeAnswer];
    }

    await assessmentAttemptRepository.update(attemptId, {
      answers: updatedAnswers,
    } as Partial<AssessmentAttemptDocument>);
  }

  async submitAttempt(
    attemptId: string,
    answers: AssessmentAnswer[],
  ): Promise<void> {
    const attempt = await this.getAttempt(attemptId);
    if (!attempt) {
      throw new Error('Attempt not found');
    }
    if (attempt.status !== 'in_progress') {
      throw new Error('Attempt already submitted or graded');
    }

    const now = serverTimestamp() as Timestamp;

    await assessmentAttemptRepository.update(attemptId, {
      answers,
      status: 'submitted',
      submittedAt: now,
    } as Partial<AssessmentAttemptDocument>);
  }
}

export const assessmentService = new AssessmentService();