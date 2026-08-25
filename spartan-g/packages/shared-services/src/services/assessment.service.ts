import {
  PERMISSIONS,
  Role,
  PermissionError,
  hasPermission,
  AssessmentDocument,
  AssessmentAttemptDocument,
  AssessmentAnswer,
  AssessmentDefinitionDocument,
  evaluateAssessmentRisk,
  type RiskEvaluationResult,
  type RiskFlag,
} from '@spartan-g/shared-types';
import { Timestamp, serverTimestamp, where, orderBy } from '../firebase/firestore';
import { assessmentRepository } from '../repositories/assessment.repository';
import { assessmentTemplateRepository } from '../repositories/assessment-template.repository';
import { assessmentQuestionRepository } from '../repositories/assessment-question.repository';
import { assessmentResponseRepository } from '../repositories/assessment-response.repository';
import { assessmentAttemptRepository } from '../repositories/assessment-attempt.repository';
import { riskAlertService } from './risk-alert.service';
import { assessmentOverrideService } from './assessment-override.service';
import { gardenService } from './garden.service';

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
    // Phase 3B: read directly from the assessments collection (bypass role-based permission check)
    return assessmentRepository.getById(assessmentId) as unknown as (AssessmentDefinitionDocument & { id: string }) | null;
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

  /** Get all submitted/graded attempts for a student (across all assessments). Sorted in-memory to avoid composite index requirements. */
  async getAttemptsByStudent(studentId: string): Promise<(AssessmentAttemptDocument & { id: string })[]> {
    const results = await assessmentAttemptRepository.getAll([
      where('studentId', '==', studentId),
      where('status', 'in', ['submitted', 'graded']),
    ]);
    // Sort by submittedAt descending in-memory to avoid composite index
    results.sort((a, b) => {
      const aTime = a.submittedAt?.toMillis?.() ?? 0;
      const bTime = b.submittedAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    return results;
  }

  async getInProgressAttempt(assessmentId: string, studentId: string): Promise<string | null> {
    const attempt = await assessmentAttemptRepository.getInProgressAttempt(assessmentId, studentId);
    return attempt?.id ?? null;
  }

  /** All in-progress attempts for a student (across all assessments). Read-only. */
  async getInProgressAttemptsByStudent(studentId: string): Promise<(AssessmentAttemptDocument & { id: string })[]> {
    const results = await assessmentAttemptRepository.getAll([
      where('studentId', '==', studentId),
      where('status', '==', 'in_progress'),
    ]);
    // Sort by startedAt descending in-memory to avoid composite index
    results.sort((a, b) => {
      const aTime = a.startedAt?.toMillis?.() ?? 0;
      const bTime = b.startedAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    return results;
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
    const assessment = await assessmentRepository.getById(assessmentId) as unknown as AssessmentDocument & { id: string } | null;
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    // Resume: check for an existing in-progress attempt BEFORE creating a new one.
    // This prevents setDoc in create() from overwriting the existing attempt's
    // answers (the ID is deterministic and static until submission).
    const existing = await assessmentAttemptRepository.getInProgressAttempt(
      assessmentId,
      studentId,
    );
    if (existing) {
      return existing.id;
    }

    const attemptCount = await this.getAttemptCount(assessmentId, studentId);
    const effectiveMax = await assessmentOverrideService.getEffectiveMaxAttempts(
      assessmentId,
      studentId,
      (assessment as any).maxAttempts,
    );
    if (attemptCount >= effectiveMax) {
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
    } as unknown as AssessmentAttemptDocument);

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
    // Idempotent: if already submitted or graded, skip the update
    if (attempt.status !== 'in_progress') {
      return;
    }

    // ─── Phase 4A: Risk evaluation (computed BEFORE status update) ──
    // Compute risk metadata synchronously from the answers (data is in memory).
    // We include it in the same update call as the submission to avoid
    // a second Firestore write that would fail the rules check
    // (student update rule requires resource.data.status == 'in_progress').
    const answersRecord: Record<string, string> = {};
    for (const answer of answers) {
      answersRecord[answer.questionId] = answer.value;
    }

    let overallRiskLevel: string | undefined;
    let overallRiskScore: number | undefined;
    let riskFlags: RiskFlag[] | undefined;
    let evaluation: RiskEvaluationResult | undefined;

    try {
      evaluation = evaluateAssessmentRisk(answersRecord);
      overallRiskLevel = evaluation.overallRiskLevel;
      overallRiskScore = evaluation.overallRiskScore;
      riskFlags = evaluation.riskFlags;
    } catch {
      // If scoring fails (e.g. non-standard question IDs), skip gracefully
    }

    const now = serverTimestamp() as Timestamp;

    await assessmentAttemptRepository.update(attemptId, {
      answers,
      status: 'submitted',
      submittedAt: now,
      ...(overallRiskLevel !== undefined ? { overallRiskLevel } : {}),
      ...(overallRiskScore !== undefined ? { overallRiskScore } : {}),
      ...(riskFlags !== undefined ? { riskFlags } : {}),
    } as Partial<AssessmentAttemptDocument>);

    // ─── Create risk alert if needed (separate collection, no rules conflict) ──
    if (overallRiskLevel === 'moderate' || overallRiskLevel === 'high' || overallRiskLevel === 'critical') {
      try {
        const assessmentDef = await this.getAssessmentDefinition(attempt.assessmentId);
        const facilitatorId = assessmentDef?.facilitatorId ?? 'unknown';

        // Pass the real evaluation object from evaluateAssessmentRisk() directly.
        // It contains domainResults (phq9, gad7, dass21) which createAlert uses
        // for the alert title severity description.
        // evaluation is guaranteed to be defined here because we only reach this
        // block when overallRiskLevel is non-undefined (set alongside evaluation).
        if (!evaluation) return;
        await riskAlertService.createAlert({
          studentId: attempt.studentId,
          facilitatorId,
          assessmentAttemptId: attemptId,
          evaluation,
        });
      } catch {
        // Alert creation failure should not block submission
      }
    }

    // GARDEN HOOK — added for Phase 1 gamification, must never block/fail submission
    try {
      await gardenService.recordCheckIn(attempt.studentId);
    } catch (err) {
      console.error('Garden check-in failed (non-fatal):', err);
    }
  }

}

export const assessmentService = new AssessmentService();
