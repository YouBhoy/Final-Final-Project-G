import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { assessmentService } from '@spartan-g/shared-services';
import type { AssessmentDocument, AssessmentQuestion, WizardState, AssessmentAnswer } from '@spartan-g/shared-types';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { WizardProgressBar } from '../../components/assessment/WizardProgressBar';
import { QuestionCard } from '../../components/assessment/QuestionCard';
import { ReviewScreen } from '../../components/assessment/ReviewScreen';
import { WizardNavigation } from '../../components/assessment/WizardNavigation';
import { Button } from '../../components/ui/Button';

export function AssessmentWizardPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Data state
  const [assessment, setAssessment] = useState<AssessmentDocument & { id: string } | null>(null);
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

  // Resume state
  const [isResuming, setIsResuming] = useState(false);

  // Confirmation state
  const [isSubmitted, setIsSubmitted] = useState(false);
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

        const assessmentData = await assessmentService.getAssessment(assessmentId);
        if (!assessmentData) {
          setError('Assessment not found. It may have been removed or unpublished.');
          return;
        }

        // Check attempt count — but only count submitted/graded attempts
        const attemptCount = await assessmentService.getAttemptCount(assessmentId, user.uid);
        const hasReachedLimit = attemptCount >= assessmentData.maxAttempts;

        // Check for in-progress attempt (this can bypass the limit)
        const existingAttemptId = await assessmentService.getInProgressAttempt(assessmentId, user.uid);

        if (hasReachedLimit && !existingAttemptId) {
          setError(`You have used all ${assessmentData.maxAttempts} attempt(s) for this assessment.`);
          return;
        }

        if (existingAttemptId) {
          // Resume existing attempt
          const existingAttempt = await assessmentService.getAttempt(existingAttemptId);
          if (!existingAttempt) {
            setError('Failed to load your previous attempt.');
            return;
          }

          // Restore answers from saved attempt data
          const restoredAnswers: Record<string, string> = {};
          for (const answer of existingAttempt.answers) {
            restoredAnswers[answer.questionId] = answer.value;
          }

          // Find first unanswered question index
          const sortedQuestions = [...assessmentData.questions].sort((a, b) => a.order - b.order);
          let firstUnanswered = sortedQuestions.findIndex(
            (q) => restoredAnswers[q.id] === undefined || restoredAnswers[q.id] === '',
          );
          if (firstUnanswered === -1) firstUnanswered = sortedQuestions.length; // all answered → review screen

          if (!cancelled) {
            setAssessment(assessmentData);
            setAttemptId(existingAttemptId);
            setWizard({
              currentStep: firstUnanswered,
              answers: restoredAnswers,
              isSubmitting: false,
              startedAt: new Date(),
            });
            setIsResuming(true);
          }
        } else {
          // Start a new attempt
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
          }
        }
      } catch (err) {
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

  const questions = assessment?.questions ?? [];
  const totalSteps = questions.length;
  const isFirstStep = wizard.currentStep === 0;
  const isLastStep = wizard.currentStep >= totalSteps - 1;
  const isOnReviewStep = wizard.currentStep >= totalSteps;

  const handleAnswer = useCallback(
    async (value: string) => {
      if (!attemptId || !assessment) return;

      const currentQuestion = questions[wizard.currentStep];
      if (!currentQuestion) return;

      // Update local state immediately
      setWizard((prev) => ({
        ...prev,
        answers: { ...prev.answers, [currentQuestion.id]: value },
      }));

      // Auto-save to Firestore
      try {
        const now = serverTimestamp() as Timestamp;
        const answer: AssessmentAnswer = {
          questionId: currentQuestion.id,
          value,
          answeredAt: now,
        };
        await assessmentService.saveAnswer(attemptId, answer);
      } catch {
        // Silently fail — answer is still in local state
      }
    },
    [attemptId, assessment, questions, wizard.currentStep],
  );

  const handlePrevious = useCallback(() => {
    setWizard((prev) => ({
      ...prev,
      currentStep: Math.max(0, prev.currentStep - 1),
    }));
  }, []);

  const handleNext = useCallback(() => {
    setWizard((prev) => ({
      ...prev,
      currentStep: Math.min(totalSteps, prev.currentStep + 1),
    }));
  }, [totalSteps]);

  const handleNavigateToQuestion = useCallback((step: number) => {
    setWizard((prev) => ({
      ...prev,
      currentStep: step,
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!attemptId) return;

    setWizard((prev) => ({ ...prev, isSubmitting: true }));
    setSubmissionError(null);

    try {
      // Build final answers list from local state
      const now = serverTimestamp() as Timestamp;
      const finalAnswers: AssessmentAnswer[] = questions
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
  }, [attemptId, questions, wizard.answers]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
                <span className="text-sm font-bold text-white">SG</span>
              </div>
              <h1 className="text-lg font-semibold text-gray-900">Assessment</h1>
            </div>
          </div>
        </header>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <svg className="h-8 w-8 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-500">Loading assessment...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
                <span className="text-sm font-bold text-white">SG</span>
              </div>
              <h1 className="text-lg font-semibold text-gray-900">Assessment</h1>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900">Unable to Start</h2>
            <p className="mt-2 text-sm text-gray-500">{error}</p>
            <div className="mt-6">
              <Link
                to="/student/dashboard"
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Submitted / Confirmation state
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
                <span className="text-sm font-bold text-white">SG</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Assessment Submitted</h1>
                <p className="text-xs text-gray-500">{assessment?.title}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <p className="text-right text-sm font-medium text-gray-700">{user?.displayName}</p>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="rounded-xl border border-gray-200 bg-white p-12 shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">Assessment Submitted!</h2>
            <p className="mt-2 text-sm text-gray-500">
              Your answers have been submitted successfully. Your score will be available after grading.
            </p>
            <div className="mt-8">
              <Button
                variant="primary"
                onClick={() => navigate('/student/dashboard')}
              >
                Return to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!assessment || !attemptId) return null;

  const currentQuestion = isOnReviewStep ? null : questions[wizard.currentStep];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
              <span className="text-sm font-bold text-white">SG</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{assessment.title}</h1>
              <p className="text-xs text-gray-500">{assessment.questions.length} questions</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <p className="text-right text-sm font-medium text-gray-700">{user?.displayName}</p>
          </div>
        </div>
      </header>

      {/* Wizard content */}
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Resume banner */}
          {isResuming && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>Resuming your previous attempt — your answers have been restored.</span>
              <button
                onClick={() => setIsResuming(false)}
                className="ml-4 font-medium hover:text-amber-900"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Instructions — shown only on first step */}
          {wizard.currentStep === 0 && assessment.instructions && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">
              <strong>Instructions:</strong> {assessment.instructions}
            </div>
          )}

          {/* Progress bar */}
          <WizardProgressBar currentStep={wizard.currentStep} totalSteps={totalSteps} />

          {/* Question or Review Screen */}
          {isOnReviewStep ? (
            <ReviewScreen
              title={assessment.title}
              questions={questions}
              answers={wizard.answers}
              onNavigateToQuestion={handleNavigateToQuestion}
              onSubmit={handleSubmit}
              isSubmitting={wizard.isSubmitting}
            />
          ) : currentQuestion ? (
            <QuestionCard
              question={currentQuestion}
              selectedAnswer={wizard.answers[currentQuestion.id]}
              onAnswer={handleAnswer}
              isDisabled={wizard.isSubmitting}
            />
          ) : null}

          {/* Submission error */}
          {submissionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {submissionError}
            </div>
          )}

          {/* Navigation (hidden during review screen) */}
          {!isOnReviewStep && (
            <WizardNavigation
              currentStep={wizard.currentStep}
              totalSteps={totalSteps}
              onPrevious={handlePrevious}
              onNext={handleNext}
              isFirstStep={isFirstStep}
              isLastStep={isLastStep}
            />
          )}
        </div>
      </main>
    </div>
  );
}