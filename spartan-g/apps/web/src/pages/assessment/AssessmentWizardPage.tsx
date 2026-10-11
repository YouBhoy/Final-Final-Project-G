import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { assessmentService, assessmentOverrideService } from '@spartan-g/shared-services';
import type { AssessmentDefinitionDocument, AssessmentQuestion, WizardState, AssessmentAnswer } from '@spartan-g/shared-types';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { WizardProgressBar } from '../../components/assessment/WizardProgressBar';
import { QuestionCard } from '../../components/assessment/QuestionCard';
import { ReviewScreen } from '../../components/assessment/ReviewScreen';
import { WizardNavigation } from '../../components/assessment/WizardNavigation';
import { Button } from '../../components/ui/Button';

type WizardPhase = 'select' | 'questions' | 'review' | 'final-review';
type SectionKey = 'phq' | 'gad' | 'dass';

const SECTIONS: { key: SectionKey; label: string; fullTitle: string; description: string; icon: string; color: string; bgColor: string; borderColor: string; textColor: string; darkBg: string }[] = [
  {
    key: 'phq',
    label: 'PHQ',
    fullTitle: 'PHQ-9: Patient Health Questionnaire',
    description: 'Depression screening — how often have you been bothered by the following over the past 2 weeks?',
    icon: 'PHQ-9',
    color: 'bg-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    textColor: 'text-indigo-900',
    darkBg: 'bg-indigo-600',
  },
  {
    key: 'gad',
    label: 'GAD',
    fullTitle: 'GAD-7: Generalized Anxiety Disorder',
    description: 'Anxiety screening — how often have you been bothered by the following over the past 2 weeks?',
    icon: 'GAD-7',
    color: 'bg-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-900',
    darkBg: 'bg-blue-600',
  },
  {
    key: 'dass',
    label: 'DASS',
    fullTitle: 'DASS-21: Depression, Anxiety & Stress Scale',
    description: 'Stress & mood — please read each statement and indicate how much it applied to you over the past week.',
    icon: 'DASS-21',
    color: 'bg-violet-600',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    textColor: 'text-violet-900',
    darkBg: 'bg-violet-600',
  },
];

function getSectionForQuestion(id: string): SectionKey | null {
  if (id.startsWith('phq')) return 'phq';
  if (id.startsWith('gad')) return 'gad';
  if (id.startsWith('dass')) return 'dass';
  return null;
}


const hasAnswer = (value: string | undefined) => value !== undefined && value !== '';

function Shell({ width = 'max-w-3xl', children }: { width?: string; children: ReactNode }) {
  return <div className={`mx-auto w-full ${width}`}>{children}</div>;
}

function PageHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start gap-x-4 gap-y-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-alt)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          ← {backLabel}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-xl font-bold text-[var(--color-text)] sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatusCard({
  tone,
  title,
  message,
  action,
}: {
  tone: 'error' | 'success';
  title: string;
  message: string;
  action: ReactNode;
}) {
  const isError = tone === 'error';
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center shadow-card">
      <div
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
          isError ? 'bg-[var(--color-error-bg)] text-[var(--color-error)]' : 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
        }`}
      >
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          {isError ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          )}
        </svg>
      </div>
      <h2 className="mt-4 text-xl font-semibold text-[var(--color-text)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{message}</p>
      <div className="mt-6">{action}</div>
    </div>
  );
}

function formatSavedAt(date: Date) {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function AssessmentWizardPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Data state
  const [assessment, setAssessment] = useState<(AssessmentDefinitionDocument & { id: string }) | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [wizard, setWizard] = useState<WizardState>({
    currentStep: 0,
    answers: {},
    isSubmitting: false,
    startedAt: new Date(),
  });

  // Phase control
  const [phase, setPhase] = useState<WizardPhase>('select');
  const [selectedSection, setSelectedSection] = useState<SectionKey | null>(null);
  const [completedSections, setCompletedSections] = useState<Set<SectionKey>>(new Set());

  // Resume state
  const [isResuming, setIsResuming] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Came from review (Next should return to review screen)
  const [cameFromReview, setCameFromReview] = useState(false);

  // Confirmation state
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isAlreadyCompleted, setIsAlreadyCompleted] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Load assessment on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!assessmentId || !user) return;

      try {
        setIsLoading(true);
        setError(null);
        setIsResuming(false);

        const assessmentData = await assessmentService.getAssessmentDefinition(assessmentId);
        if (!assessmentData) {
          setError('Assessment not found. It may have been removed or unpublished.');
          return;
        }

        const attemptCount = await assessmentService.getAttemptCount(assessmentId, user.uid);
        const effectiveMax = await assessmentOverrideService.getEffectiveMaxAttempts(
          assessmentId,
          user.uid,
          assessmentData.maxAttempts,
        );
        const hasReachedLimit = attemptCount >= effectiveMax;
        const existingAttemptId = await assessmentService.getInProgressAttempt(assessmentId, user.uid);

        // If no in-progress attempt but attempts exist, the student already submitted — show the "already completed" state
        if (hasReachedLimit && !existingAttemptId) {
          if (!cancelled) {
            setAssessment(assessmentData);
            setIsAlreadyCompleted(true);
            setIsLoading(false);
          }
          return;
        }

        if (existingAttemptId) {
          const existingAttempt = await assessmentService.getAttempt(existingAttemptId);
          if (!existingAttempt) {
            setError('Failed to load your previous attempt.');
            return;
          }

          const restoredAnswers: Record<string, string> = {};
          for (const answer of existingAttempt.answers) {
            restoredAnswers[answer.questionId] = answer.value;
          }

          // Determine which sections are completed
          const sortedQuestions = [...assessmentData.questions].sort((a, b) => a.order - b.order);
          const completed = new Set<SectionKey>();
          for (const s of SECTIONS) {
            const sectionQs = sortedQuestions.filter((q) => getSectionForQuestion(q.id) === s.key);
            if (sectionQs.length > 0 && sectionQs.every((q) => restoredAnswers[q.id] !== undefined && restoredAnswers[q.id] !== '')) {
              completed.add(s.key);
            }
          }

          if (!cancelled) {
            setAssessment(assessmentData);
            setAttemptId(existingAttemptId);
            setWizard({
              currentStep: 0,
              answers: restoredAnswers,
              isSubmitting: false,
              startedAt: new Date(),
            });
            setCompletedSections(completed);
            const savedTimes = existingAttempt.answers
              .map((a) => (a.answeredAt as unknown as { toDate?: () => Date } | undefined)?.toDate?.())
              .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
            setLastSavedAt(savedTimes.length ? new Date(Math.max(...savedTimes.map((d) => d.getTime()))) : null);
            setIsResuming(true);
            setPhase('select');
          }
        } else {
          const newAttemptId = await assessmentService.startAttempt(assessmentId, user.uid);

          if (!cancelled) {
            setAssessment(assessmentData);
            setAttemptId(newAttemptId);
            setWizard({
              currentStep: 0,
              answers: {},
              isSubmitting: false,
              startedAt: new Date(),
            });
            setPhase('select');
          }
        }
      } catch (err) {
        // Surface the real cause: the repository wraps Firestore errors in a generic message.
        const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
        console.error('[AssessmentWizard] failed to load or start the assessment', {
          assessmentId,
          appCode: (err as { code?: string })?.code,
          firestoreCode: cause?.code,
          firestoreMessage: cause?.message,
          error: err,
        });
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load assessment');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [assessmentId, user]);

  const allQuestions = assessment?.questions ?? [];
  const sortedAllQuestions = useMemo(() => [...allQuestions].sort((a, b) => a.order - b.order), [allQuestions]);

  // Section-scoped questions
  const sectionQuestions = useMemo(() => {
    if (!selectedSection) return [];
    return sortedAllQuestions.filter((q) => getSectionForQuestion(q.id) === selectedSection);
  }, [sortedAllQuestions, selectedSection]);

  const totalSteps = sectionQuestions.length;
  const isFirstStep = wizard.currentStep === 0;
  const isLastStep = wizard.currentStep >= totalSteps - 1;
  const isOnReviewStep = wizard.currentStep >= totalSteps;

  const handleSectionSelect = useCallback((sectionKey: SectionKey) => {
    setSelectedSection(sectionKey);
    setWizard((prev) => ({ ...prev, currentStep: 0 }));
    setPhase('questions');
    setIsResuming(false);
  }, []);

  const handleBackToSelect = useCallback(() => {
    // Mark current section as completed if all questions answered
    if (selectedSection) {
      const sectionQs = sortedAllQuestions.filter((q) => getSectionForQuestion(q.id) === selectedSection);
      const allAnswered = sectionQs.every((q) => wizard.answers[q.id] !== undefined && wizard.answers[q.id] !== '');
      if (allAnswered) {
        setCompletedSections((prev) => new Set(prev).add(selectedSection!));
      }
    }
    setSelectedSection(null);
    setWizard((prev) => ({ ...prev, currentStep: 0 }));
    setPhase('select');
  }, [selectedSection, sortedAllQuestions, wizard.answers]);

  const handleAllSectionsComplete = useCallback(() => {
    setPhase('final-review');
  }, []);

  const handleAnswer = useCallback(
    async (value: string) => {
      if (!attemptId || !assessment) return;
      const currentQuestion = sectionQuestions[wizard.currentStep];
      if (!currentQuestion) return;

      setWizard((prev) => ({
        ...prev,
        answers: { ...prev.answers, [currentQuestion.id]: value },
      }));

      try {
        const now = serverTimestamp() as Timestamp;
        const answer: AssessmentAnswer = {
          questionId: currentQuestion.id,
          value,
          answeredAt: now,
        };
        await assessmentService.saveAnswer(attemptId, answer);
        setSaveError(null);
        setLastSavedAt(new Date());
      } catch (err) {
        console.error("saveAnswer failed:", err);
        setSaveError('Your last answer could not be saved. Check your connection and select it again.');
      }
    },
    [attemptId, assessment, sectionQuestions, wizard.currentStep],
  );

  const handlePrevious = useCallback(() => {
    setWizard((prev) => ({
      ...prev,
      currentStep: Math.max(0, prev.currentStep - 1),
    }));
  }, []);

  const handleNext = useCallback(() => {
    setWizard((prev) => {
      // If came from review, return to the review screen instead of advancing
      if (cameFromReview) {
        setCameFromReview(false);
        return { ...prev, currentStep: totalSteps };
      }
      return { ...prev, currentStep: Math.min(totalSteps, prev.currentStep + 1) };
    });
  }, [totalSteps, cameFromReview]);

  // Auto-advance when an answer is selected (skip when returning from review)
  const prevAnswerCount = useMemo(() => Object.keys(wizard.answers).length, [wizard.answers]);
  useEffect(() => {
    if (cameFromReview || phase !== 'questions') return;
    const currentAnswerCount = Object.keys(wizard.answers).length;
    if (currentAnswerCount > prevAnswerCount && !isOnReviewStep) {
      const timer = setTimeout(() => {
        handleNext();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [wizard.answers, cameFromReview, phase, isOnReviewStep, prevAnswerCount, handleNext]);

  const handleNavigateToQuestion = useCallback((step: number) => {
    setWizard((prev) => ({
      ...prev,
      currentStep: step,
    }));
  }, []);

  /** Dropdown navigation: explicit jump, so "Next" should advance normally. */
  const handleDropdownNavigate = useCallback((step: number) => {
    setCameFromReview(false);
    setWizard((prev) => ({
      ...prev,
      currentStep: step,
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!attemptId) return;

    // Require every question to be answered before submitting
    const unanswered = sortedAllQuestions.filter(
      (q) => wizard.answers[q.id] === undefined || wizard.answers[q.id] === ''
    );
    if (unanswered.length > 0) {
      setSubmissionError(
        `Please answer all questions before submitting — ${unanswered.length} remaining.`
      );
      // Jump straight to the first unanswered question's section
      const firstUnanswered = unanswered[0];
      const section = getSectionForQuestion(firstUnanswered.id);
      if (section) {
        setSelectedSection(section);
        setCameFromReview(false);
        const sectionQs = sortedAllQuestions.filter((q) => getSectionForQuestion(q.id) === section);
        const indexInSection = sectionQs.findIndex((q) => q.id === firstUnanswered.id);
        setWizard((prev) => ({
          ...prev,
          currentStep: indexInSection >= 0 ? indexInSection : 0,
        }));
        setPhase('questions');
      }
      return;
    }

    setWizard((prev) => ({ ...prev, isSubmitting: true }));
    setSubmissionError(null);

      try {
        const now = new Date() as unknown as Timestamp;
        const finalAnswers: AssessmentAnswer[] = sortedAllQuestions
          .filter((q) => wizard.answers[q.id] !== undefined && wizard.answers[q.id] !== '')
          .map((q) => ({
            questionId: q.id,
            value: wizard.answers[q.id],
            answeredAt: now,
          }));

        await assessmentService.submitAttempt(attemptId, finalAnswers);
        setIsSubmitted(true);
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : 'Failed to submit assessment');
    } finally {
      setWizard((prev) => ({ ...prev, isSubmitting: false }));
    }
  }, [attemptId, sortedAllQuestions, wizard.answers]);

  // ─── Loading ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <Shell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="flex flex-col items-center space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            <p className="text-sm text-[var(--color-text-secondary)]">Loading assessment...</p>
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Error ─────────────────────────────────────────────
  if (error) {
    return (
      <Shell>
        <StatusCard
          tone="error"
          title="Unable to Start"
          message={error}
          action={
            <Link
              to="/student/dashboard"
              className="inline-flex items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--color-primary-light)]"
            >
              Return to Dashboard
            </Link>
          }
        />
      </Shell>
    );
  }

  // ─── Already Completed ─────────────────────────────────
  if (isAlreadyCompleted) {
    return (
      <Shell>
        <PageHeader title={assessment?.title ?? 'Assessment'} subtitle="Already completed" />
        <StatusCard
          tone="success"
          title="Already Answered"
          message="You have already answered the assessment. Your responses have been recorded."
          action={<Button variant="primary" onClick={() => navigate('/student/dashboard')}>Return to Dashboard</Button>}
        />
      </Shell>
    );
  }

  // ─── Submitted ─────────────────────────────────────────
  if (isSubmitted) {
    return (
      <Shell>
        <PageHeader title="Assessment Submitted" subtitle={assessment?.title} />
        <StatusCard
          tone="success"
          title="Thank you for completing your assessment"
          message="Your responses have been recorded."
          action={<Button variant="primary" onClick={() => navigate('/student/dashboard')}>Return to Dashboard</Button>}
        />
      </Shell>
    );
  }

  if (!assessment || !attemptId) return null;

  const sectionStats = SECTIONS.map((section) => {
    const qs = sortedAllQuestions.filter((q) => getSectionForQuestion(q.id) === section.key);
    const answered = qs.filter((q) => hasAnswer(wizard.answers[q.id])).length;
    const complete = completedSections.has(section.key) || (qs.length > 0 && answered === qs.length);
    return { section, total: qs.length, answered, complete, inProgress: !complete && answered > 0 };
  });
  const sectionsCompleted = sectionStats.filter((s) => s.complete).length;
  const sectionsInProgress = sectionStats.filter((s) => s.inProgress).length;
  const sectionsNotStarted = SECTIONS.length - sectionsCompleted - sectionsInProgress;
  const totalAnsweredAll = sortedAllQuestions.filter((q) => hasAnswer(wizard.answers[q.id])).length;
  const overallPercent = sortedAllQuestions.length
    ? Math.round((totalAnsweredAll / sortedAllQuestions.length) * 100)
    : 0;

  // ─── Section Selection Screen ──────────────────────────
  if (phase === 'select') {
    return (
      <Shell width="max-w-4xl">
        <PageHeader
          title={assessment.title}
          subtitle="Select a section to begin"
          onBack={() => navigate('/student/dashboard')}
          backLabel="Back to Dashboard"
        />

        <div className="space-y-6">
          {isResuming && (
            <div className="flex items-start justify-between gap-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>
                Resuming your previous attempt — your answers have been restored.
                {lastSavedAt && <span className="block text-xs text-amber-700">Last saved {formatSavedAt(lastSavedAt)}</span>}
              </span>
              <button type="button" onClick={() => setIsResuming(false)} className="shrink-0 font-medium hover:text-amber-900">
                Dismiss
              </button>
            </div>
          )}

          {assessment.instructions && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-info)]/20 bg-[var(--color-info-bg)] p-4 text-sm text-[var(--color-info)]">
              <strong>Instructions:</strong> {assessment.instructions}
            </div>
          )}

          {/* Overall progress */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-base font-semibold text-[var(--color-text)]">
                {sectionsCompleted} of {SECTIONS.length} sections completed
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {sectionsInProgress} in progress · {sectionsNotStarted} not started
              </p>
            </div>
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
              role="progressbar"
              aria-valuenow={overallPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${totalAnsweredAll} of ${sortedAllQuestions.length} questions answered`}
            >
              <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300" style={{ width: `${overallPercent}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
              {totalAnsweredAll} of {sortedAllQuestions.length} questions answered
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">Choose a Section</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Complete each section one at a time. You can do them in any order.</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {sectionStats.map(({ section, total, answered, complete, inProgress }) => (
              <button
                key={section.key}
                type="button"
                onClick={() => handleSectionSelect(section.key)}
                className={`group flex flex-col gap-4 rounded-[var(--radius-lg)] border p-5 text-left transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 sm:flex-row sm:items-center ${
                  complete
                    ? 'border-green-200 bg-green-50 hover:border-green-300'
                    : `${section.borderColor} ${section.bgColor}`
                }`}
              >
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${section.darkBg}`}>
                    {section.label}
                  </div>
                  <div className="min-w-0">
                    <h3 className={`text-base font-bold sm:text-lg ${complete ? 'text-green-900' : section.textColor}`}>{section.fullTitle}</h3>
                    <p className={`mt-0.5 text-sm ${complete ? 'text-green-700' : 'text-[var(--color-text-secondary)]'}`}>{section.description}</p>
                  </div>
                </div>

                {/* Status + action: one consistent right-hand column */}
                <div className="flex shrink-0 items-center justify-between gap-3 sm:w-40 sm:flex-col sm:items-end sm:justify-center sm:gap-2">
                  {complete ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Completed
                    </span>
                  ) : inProgress ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">In progress</span>
                  ) : (
                    <span className="text-xs text-[var(--color-text-secondary)]">Not started</span>
                  )}
                  <span className="text-xs text-[var(--color-text-secondary)]">{answered}/{total} questions</span>
                  <span className={`text-sm font-medium ${complete ? 'text-green-600' : 'text-indigo-600'}`}>
                    {complete ? 'Review' : inProgress ? 'Continue' : 'Start'} →
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Show submit button only if all sections completed */}
          {sectionsCompleted === SECTIONS.length && (
            <div className="rounded-[var(--radius-lg)] border border-green-200 bg-green-50 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="mt-3 text-lg font-bold text-green-900">All Sections Completed!</h3>
              <p className="mt-1 text-sm text-green-700">You've answered all {SECTIONS.length} sections. Ready to review and submit?</p>
              <div className="mt-4">
                <Button variant="primary" onClick={handleAllSectionsComplete}>
                  Review & Submit
                </Button>
              </div>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ─── Final Review & Submit ─────────────────────────────
  if (phase === 'final-review') {
    const answeredCount = totalAnsweredAll;
    const totalCount = sortedAllQuestions.length;
    const allAnswered = answeredCount === totalCount;

    return (
      <Shell>
        <PageHeader
          title="Review & Submit"
          subtitle={assessment.title}
          onBack={() => setPhase('select')}
          backLabel="Back"
        />

        <div className="space-y-6">
          {/* Summary header */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-card">
            <h2 className="text-xl font-bold text-[var(--color-text)]">Review All Answers</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Please review your answers before submitting. You can go back to any section to make changes.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className={`text-sm font-semibold ${allAnswered ? 'text-green-600' : 'text-amber-600'}`}>
                {answeredCount} of {totalCount} answered
              </span>
              {!allAnswered && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {totalCount - answeredCount} unanswered
                </span>
              )}
            </div>
          </div>

          {/* Questions grouped by section */}
          {SECTIONS.map((section) => {
            const sectionQs = sortedAllQuestions.filter((q) => getSectionForQuestion(q.id) === section.key);
            if (sectionQs.length === 0) return null;

            const sectionAnswered = sectionQs.filter((q) => hasAnswer(wizard.answers[q.id])).length;

            return (
              <div key={section.key} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className={`text-base font-bold ${section.textColor}`}>{section.fullTitle}</h3>
                  <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">{sectionAnswered}/{sectionQs.length} answered</span>
                </div>

                {sectionQs.map((question, qIndex) => {
                  const answer = wizard.answers[question.id];
                  const isAnswered = hasAnswer(answer);
                  const chosen = question.options?.find((o) => o.id === answer)?.label ?? answer;

                  return (
                    <div
                      key={question.id}
                      className={`rounded-[var(--radius-lg)] border p-4 shadow-card ${
                        isAnswered ? 'border-[var(--color-border)] bg-[var(--color-surface)]' : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                            Question {qIndex + 1}
                          </span>
                          <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{question.text}</p>
                          <p className={`mt-1 text-sm ${isAnswered ? 'text-[var(--color-text-secondary)]' : 'font-semibold text-amber-700'}`}>
                            {isAnswered ? `Answer: ${chosen}` : 'Not answered'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            // Jump to this question, remembering we came from review
                            // so "Next" takes the student back to the review screen.
                            setCameFromReview(true);
                            setSelectedSection(section.key);
                            const idx = sectionQs.findIndex((q) => q.id === question.id);
                            setWizard((prev) => ({ ...prev, currentStep: idx >= 0 ? idx : 0 }));
                            setPhase('questions');
                          }}
                          className="shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/5"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Unanswered warning — blocks submission */}
          {!allAnswered && (
            <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Please answer all questions before submitting — {totalCount - answeredCount} remaining.
            </div>
          )}

          {/* Submit error */}
          {submissionError && (
            <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {submissionError}
            </div>
          )}

          {/* Submit button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleSubmit}
            isLoading={wizard.isSubmitting}
          >
            Submit Assessment
          </Button>
        </div>
      </Shell>
    );
  }

  // ─── Questions Phase ───────────────────────────────────
  const currentQuestion = isOnReviewStep ? null : sectionQuestions[wizard.currentStep];
  const sectionConfig = SECTIONS.find((s) => s.key === selectedSection);
  const answeredInSection = sectionQuestions.filter((q) => hasAnswer(wizard.answers[q.id])).length;

  return (
    <Shell>
      <PageHeader
        title={sectionConfig?.fullTitle ?? assessment.title}
        subtitle={`${sectionQuestions.length} questions`}
        onBack={handleBackToSelect}
        backLabel="Back"
      />

      <div className="space-y-6">
        {sectionConfig && (
          <div className={`rounded-[var(--radius-lg)] border p-5 ${sectionConfig.borderColor} ${sectionConfig.bgColor}`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${sectionConfig.darkBg}`}>
                {sectionConfig.label}
              </div>
              <p className="min-w-0 text-sm text-[var(--color-text-secondary)]">{sectionConfig.description}</p>
            </div>
          </div>
        )}

        <WizardProgressBar
          currentStep={wizard.currentStep}
          totalSteps={totalSteps}
          answeredCount={answeredInSection}
        />

        {saveError && (
          <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
            {saveError}
          </div>
        )}

        {isOnReviewStep ? (
          <ReviewScreen
            title={sectionConfig?.fullTitle ?? assessment.title}
            questions={sectionQuestions}
            answers={wizard.answers}
            onNavigateToQuestion={(step: number) => {
              // Jump back to a question, remembering we came from review
              // so "Next" returns here instead of advancing past it.
              setCameFromReview(true);
              handleNavigateToQuestion(step);
            }}
            onSubmit={() => {
              // Mark section completed and go back to select
              if (selectedSection) {
                setCompletedSections((prev) => new Set(prev).add(selectedSection));
              }
              handleBackToSelect();
            }}
            isSubmitting={wizard.isSubmitting}
          />
        ) : currentQuestion ? (
          <QuestionCard
            question={currentQuestion}
            selectedAnswer={wizard.answers[currentQuestion.id]}
            onAnswer={handleAnswer}
            isDisabled={wizard.isSubmitting}
            questionNumber={wizard.currentStep + 1}
            totalQuestions={totalSteps}
          />
        ) : null}

        {submissionError && (
          <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {submissionError}
          </div>
        )}

        {!isOnReviewStep && (
          <WizardNavigation
            currentStep={wizard.currentStep}
            totalSteps={totalSteps}
            onPrevious={handlePrevious}
            onNext={handleNext}
            isFirstStep={isFirstStep}
            isLastStep={isLastStep}
            questions={sectionQuestions}
            answers={wizard.answers}
            onNavigateToQuestion={handleDropdownNavigate}
          />
        )}
      </div>
    </Shell>
  );
}
