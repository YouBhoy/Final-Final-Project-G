import {
  PERMISSIONS,
  Role,
  PermissionError,
  AppError,
  hasPermission,
  AssessmentDocument,
  AssessmentAttemptDocument,
  AssessmentAnswer,
  AssessmentDefinitionDocument,
  UserDocument,
  evaluateAssessmentRisk,
  planNextAttempt,
  type Campus,
  type RiskEvaluationResult,
  type RiskFlag,
} from '@spartan-g/shared-types';
import { Timestamp, serverTimestamp, where, orderBy } from '../firebase/firestore';
import { assessmentRepository } from '../repositories/assessment.repository';
import { assessmentTemplateRepository } from '../repositories/assessment-template.repository';
import { assessmentQuestionRepository } from '../repositories/assessment-question.repository';
import { assessmentResponseRepository } from '../repositories/assessment-response.repository';
import { assessmentAttemptRepository } from '../repositories/assessment-attempt.repository';
import { userRepository } from '../repositories/user.repository';
import { assessmentOverrideService } from './assessment-override.service';
import { riskAlertService } from './risk-alert.service';
import { notificationService } from './notification.service';

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

  async getAttemptCount(assessmentId: string, studentId: string): Promise<number> {
    const attempts = await assessmentAttemptRepository.getAll([
      where('assessmentId', '==', assessmentId),
      where('studentId', '==', studentId),
      where('status', 'in', ['submitted', 'graded']),
    ]);
    return attempts.length;
  }

  async startAttempt(assessmentId: string, studentId: string): Promise<string> {
    // Ids become document paths and attempt ids; empty ones or ones containing "/" are invalid paths.
    const validId = (value: unknown) => typeof value === 'string' && value.length > 0 && !value.includes('/');
    if (!validId(assessmentId) || !validId(studentId)) {
      console.error('[AssessmentService.startAttempt] invalid assessment or student id', { assessmentId, studentId });
      throw new AppError(
        "We couldn't start this assessment because the link or your account details are incomplete. Please sign in again or contact your administrator.",
        'assessment/invalid-reference',
      );
    }

    const assessment = await this.tracedStartStep('load assessment', { assessmentId }, () =>
      assessmentRepository.getById(assessmentId),
    ) as unknown as AssessmentDocument & { id: string } | null;
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    // Every attempt of this student on this assessment (any status).
    const existingAttempts = await this.tracedStartStep('list existing attempts', { assessmentId, studentId }, () =>
      assessmentAttemptRepository.getAll([
        where('assessmentId', '==', assessmentId),
        where('studentId', '==', studentId),
      ]),
    );

    // An unfinished attempt is resumed, never duplicated.
    const inProgress = existingAttempts.find((a) => a.status === 'in_progress');
    if (inProgress) return inProgress.id;

    const effectiveMax = await assessmentOverrideService.getEffectiveMaxAttempts(
      assessmentId,
      studentId,
      (assessment as any).maxAttempts,
    );

    // The next number is (highest existing number) + 1, not (finished count) + 1, so gaps or
    // legacy attempts can't make us pick an id the Firestore rule refuses or one that exists.
    const plan = planNextAttempt(assessmentId, studentId, existingAttempts, effectiveMax);
    if (!plan.ok) {
      if (plan.reason === 'limit') throw this.attemptLimitError(effectiveMax);
      console.error('[AssessmentService.startAttempt] attempt history is out of sequence', {
        assessmentId,
        detail: plan.detail,
        issues: plan.analysis.issues,
        attempts: plan.analysis.entries.map((e) => ({ id: e.id, status: e.status, number: e.fieldNumber })),
      });
      throw new AppError(
        "Your attempt history has records that are out of sequence, so a new attempt can't be started automatically. Please contact your administrator.",
        'assessment/attempt-chain-broken',
      );
    }
    const attemptCount = plan.analysis.finishedCount;

    const now = serverTimestamp() as Timestamp;
    const attemptId = plan.attemptId;

    // Associate the student's campus with this attempt so results can be
    // aggregated by campus for analytics (best-effort lookup).
    let campus: Campus | undefined;
    try {
      const studentUser = await userRepository.getById(studentId);
      campus = (studentUser as (UserDocument & { id: string }) | null)?.campus;
    } catch (error) {
      console.warn('[AssessmentService.startAttempt] could not read the student record for the campus; continuing without it', error);
      campus = undefined;
    }

    try {
      // Only include fields that have a value: Firestore rejects `undefined` (invalid-argument), and
      // accounts created before campuses were required have no campus.
      await assessmentAttemptRepository.create(attemptId, {
        assessmentId,
        studentId,
        ...(campus ? { campus } : {}),
        answers: [],
        status: 'in_progress',
        startedAt: now,
        attemptNumber: plan.attemptNumber,
      } as unknown as AssessmentAttemptDocument);
    } catch (error) {
      throw await this.explainStartFailure(error, {
        assessmentId,
        studentId,
        attemptId,
        attemptCount,
        effectiveMax,
        defaultMax: (assessment as any).maxAttempts,
      });
    }

    return attemptId;
  }

  /** Runs one Firestore step of startAttempt and logs the real Firestore error (not the repository wrapper). */
  private async tracedStartStep<T>(step: string, context: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
      console.error(`[AssessmentService.startAttempt] "${step}" failed`, {
        ...context,
        firestoreCode: cause?.code ?? (error as { code?: string })?.code ?? 'unknown',
        firestoreMessage: cause?.message ?? (error instanceof Error ? error.message : String(error)),
      });
      throw error;
    }
  }

  private attemptLimitError(limit: number): AppError {
    return new AppError(
      `You have used all ${limit} attempt${limit === 1 ? '' : 's'}. Ask your administrator for an override.`,
      'assessment/attempt-limit',
    );
  }

  /**
   * The repository wraps every Firestore failure in a generic "Failed to create ..."
   * message, which hides the real cause. Log the real Firestore error code, then work
   * out (with fresh, non-swallowed reads) whether the attempt limit was the reason.
   */
  private async explainStartFailure(
    error: unknown,
    ctx: {
      assessmentId: string;
      studentId: string;
      attemptId: string;
      attemptCount: number;
      effectiveMax: number;
      defaultMax: number;
    },
  ): Promise<AppError> {
    const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
    const code = cause?.code ?? (error as { code?: string })?.code ?? 'unknown';
    console.error('[AssessmentService.startAttempt] could not create attempt', {
      attemptId: ctx.attemptId,
      firestoreCode: code,
      firestoreMessage: cause?.message ?? (error instanceof Error ? error.message : String(error)),
      attemptsCounted: ctx.attemptCount,
      limitUsedByClient: ctx.effectiveMax,
      assessmentDefaultMax: ctx.defaultMax,
    });

    if (code === 'invalid-argument') {
      return new AppError(
        "We couldn't start the assessment because some of your account or attempt data is invalid (invalid-argument). Please contact your administrator.",
        'assessment/invalid-data',
        error,
      );
    }

    if (code !== 'permission-denied') {
      return new AppError(
        `We couldn't start the assessment (${code}). Please check your connection and try again.`,
        'assessment/start-failed',
        error,
      );
    }

    // Re-check against fresh data. Unlike getEffectiveMaxAttempts, a failed override read is not hidden.
    let overrideValue: number | null = null;
    let overrideReadError: unknown = null;
    try {
      const override = await assessmentOverrideService.getOverride(ctx.assessmentId, ctx.studentId);
      overrideValue = override && override.maxAttemptsOverride > 0 ? override.maxAttemptsOverride : null;
    } catch (overrideError) {
      overrideReadError = overrideError;
      console.error('[AssessmentService.startAttempt] could not read the override document', overrideError);
    }
    const freshCount = await this.getAttemptCount(ctx.assessmentId, ctx.studentId).catch(() => ctx.attemptCount);
    const limit = overrideValue ?? ctx.defaultMax;
    if (freshCount >= limit) return this.attemptLimitError(limit);

    // Not the limit: the previous attempt isn't finished, or the attempt numbering is inconsistent.
    console.error('[AssessmentService.startAttempt] denied although the limit looks fine', {
      freshCount,
      limit,
      overrideReadFailed: overrideReadError !== null,
    });
    return new AppError(
      "We couldn't start a new attempt because your previous attempt record isn't complete. Please contact your administrator.",
      'assessment/start-denied',
      error,
    );
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

    // ─── Notify the facilitator (best-effort) about the new submission ──
    // Gives them a clickable notification that deep-links to their
    // assessments page. Failures must never block the submission.
    try {
      const assessmentDef = await this.getAssessmentDefinition(attempt.assessmentId);
      const facilitatorId = assessmentDef?.facilitatorId;
      if (facilitatorId && facilitatorId !== 'unknown' && facilitatorId !== attempt.studentId) {
        await notificationService.createInAppNotification({
          userId: facilitatorId,
          title: 'New Assessment Submission',
          body: `${assessmentDef?.title || 'An assessment'} was submitted and is ready for review.`,
          type: 'assessment',
          relatedId: attemptId,
        });
      }
    } catch {
      // Notification failure should not block submission
    }
  }

}

export const assessmentService = new AssessmentService();
