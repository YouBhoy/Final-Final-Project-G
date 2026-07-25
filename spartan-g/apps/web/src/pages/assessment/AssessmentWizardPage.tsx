import { useState, useEffect, useCallback, useMemo } from 'react';
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
      } catch (err) {
        console.error("saveAnswer failed:", err);
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
      // If came from review, return to review screen
      if (cameFromReview) {
        setCameFromReview(false);
        return { ...prev, currentStep: totalSteps };
      }
      return { ...prev, currentStep: Math.min(totalSteps, prev.currentStep + 1) };
    });
  }, [totalSteps, cameFromReview]);

  // Auto-advance when an answer is selected (skip if came from review)
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

  const handleSubmit = useCallback(async () => {
    if (!attemptId) return;

    // Validate all questions have answers before submitting
    const unanswered = sortedAllQuestions.filter(
      (q) => wizard.answers[q.id] === undefined || wizard.answers[q.id] === ''
    );
    if (unanswered.length > 0) {
      const firstUnansweredIndex = sortedAllQuestions.findIndex(
        (q) => wizard.answers[q.id] === undefined || wizard.answers[q.id] === ''
      );
      setSubmissionError(
        `Please answer all questions before submitting — ${unanswered.length} remaining.`
      );
      // Navigate to the section containing the first unanswered question
      const firstUnanswered = unanswered[0];
      const section = getSectionForQuestion(firstUnanswered.id);
      if (section) {
        setSelectedSection(section);
        setWizard((prev) => ({
          ...prev,
          currentStep: sortedAllQuestions.indexOf(firstUnanswered),
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

  // ─── Error ─────────────────────────────────────────────
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
              <Link to="/student/dashboard" className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Already Completed ─────────────────────────────────
  if (isAlreadyCompleted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600">
                <span className="text-sm font-bold text-white">SG</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{assessment?.title}</h1>
                <p className="text-xs text-gray-500">Already completed</p>
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
            <h2 className="mt-4 text-2xl font-bold text-gray-900">Already Answered</h2>
            <p className="mt-2 text-sm text-gray-500">You have already answered the assessment. Your responses have been recorded.</p>
            <div className="mt-8">
              <Button variant="primary" onClick={() => navigate('/student/dashboard')}>Return to Dashboard</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Submitted ─────────────────────────────────────────
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 01-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">Congratulations!</h2>
            <p className="mt-2 text-sm text-gray-500">You've successfully completed your assessment.</p>
            <div className="mt-8">
              <Button variant="primary" onClick={() => navigate('/student/dashboard')}>Return to Dashboard</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!assessment || !attemptId) return null;

  // ─── Section Selection Screen ──────────────────────────
  if (phase === 'select') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
                <span className="text-sm font-bold text-white">SG</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{assessment.title}</h1>
                <p className="text-xs text-gray-500">Select a section to begin</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <p className="text-right text-sm font-medium text-gray-700">{user?.displayName}</p>
              <button onClick={() => navigate('/student/dashboard')} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Back to Dashboard
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {isResuming && (
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span>Resuming your previous attempt — your answers have been restored.</span>
                <button onClick={() => setIsResuming(false)} className="ml-4 font-medium hover:text-amber-900">Dismiss</button>
              </div>
            )}

            {assessment.instructions && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">
                <strong>Instructions:</strong> {assessment.instructions}
              </div>
            )}

            <div>
              <h2 className="text-xl font-bold text-gray-900">Choose a Section</h2>
              <p className="mt-1 text-sm text-gray-500">Complete each section one at a time. You can do them in any order.</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {SECTIONS.map((section) => {
                const sectionQs = sortedAllQuestions.filter((q) => getSectionForQuestion(q.id) === section.key);
                const completed = completedSections.has(section.key);
                const answeredCount = sectionQs.filter((q) => wizard.answers[q.id] !== undefined && wizard.answers[q.id] !== '').length;

                return (
                  <button
                    key={section.key}
                    onClick={() => handleSectionSelect(section.key)}
                    className={`group rounded-xl border-2 p-6 text-left transition-all hover:shadow-md ${
                      completed
                        ? 'border-green-200 bg-green-50 hover:border-green-300'
                        : `${section.borderColor} ${section.bgColor} hover:shadow-md`
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl font-bold text-white text-sm ${section.darkBg}`}>
                          {section.label}
                        </div>
                        <div>
                          <h3 className={`text-lg font-bold ${completed ? 'text-green-900' : section.textColor}`}>
                            {section.fullTitle}
                          </h3>
                          <p className={`mt-0.5 text-sm ${completed ? 'text-green-700' : 'text-gray-600'}`}>
                            {section.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {completed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Completed
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">{answeredCount}/{sectionQs.length} questions</span>
                        )}
                        <span className={`text-sm font-medium ${completed ? 'text-green-600' : 'text-indigo-600'}`}>
                          {completed ? 'Review' : 'Start'} →
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Show submit button only if all sections completed */}
            {completedSections.size === SECTIONS.length && (
              <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="mt-3 text-lg font-bold text-green-900">All Sections Completed!</h3>
                <p className="mt-1 text-sm text-green-700">You've answered all 3 sections. Ready to review and submit?</p>
                <div className="mt-4">
                  <Button variant="primary" onClick={handleAllSectionsComplete}>
                    Review & Submit
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ─── Final Review & Submit ─────────────────────────────
  if (phase === 'final-review') {
    const answeredCount = sortedAllQuestions.filter(
      (q) => wizard.answers[q.id] !== undefined && wizard.answers[q.id] !== ''
    ).length;
    const totalCount = sortedAllQuestions.length;
    const allAnswered = answeredCount === totalCount;

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4">
              <button onClick={() => setPhase('select')} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                ← Back
              </button>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
                <span className="text-sm font-bold text-white">SG</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Review & Submit</h1>
                <p className="text-xs text-gray-500">{assessment.title}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <p className="text-right text-sm font-medium text-gray-700">{user?.displayName}</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {/* Summary header */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">Review All Answers</h2>
              <p className="mt-1 text-sm text-gray-500">
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

              const sectionAnswered = sectionQs.filter(
                (q) => wizard.answers[q.id] !== undefined && wizard.answers[q.id] !== ''
              ).length;

              return (
                <div key={section.key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-base font-bold ${section.textColor}`}>{section.fullTitle}</h3>
                    <span className="text-xs text-gray-500">{sectionAnswered}/{sectionQs.length} answered</span>
                  </div>

                  {sectionQs.map((question) => {
                    const answer = wizard.answers[question.id];
                    const isAnswered = answer !== undefined && answer !== '';
                    // Find the global index of this question in sortedAllQuestions
                    const globalIndex = sortedAllQuestions.findIndex((q) => q.id === question.id);

                    return (
                      <div
                        key={question.id}
                        className={`rounded-xl border p-4 shadow-sm ${
                          isAnswered ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                Q{question.order}
                              </span>
                            </div>
                            <p className="mt-1 text-sm font-medium text-gray-900">{question.text}</p>
                            <p className={`mt-1 text-sm ${isAnswered ? 'text-gray-600' : 'font-semibold text-amber-700'}`}>
                              {isAnswered ? `Answer: ${answer}` : 'Not answered'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const section = getSectionForQuestion(question.id);
                              if (section) {
                                setSelectedSection(section);
                                setCameFromReview(true);
                                setWizard((prev) => ({
                                  ...prev,
                                  currentStep: globalIndex,
                                }));
                                setPhase('questions');
                              }
                            }}
                            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
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
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Please answer all questions before submitting — {totalCount - answeredCount} remaining.
              </div>
            )}

            {/* Submit error */}
            {submissionError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
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
        </main>
      </div>
    );
  }

  // ─── Questions Phase ───────────────────────────────────
  const currentQuestion = isOnReviewStep ? null : sectionQuestions[wizard.currentStep];
  const sectionConfig = SECTIONS.find((s) => s.key === selectedSection);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4">
            <button onClick={handleBackToSelect} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              ← Back
            </button>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white text-xs ${sectionConfig?.darkBg ?? 'bg-indigo-600'}`}>
              {sectionConfig?.label ?? 'Q'}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{sectionConfig?.fullTitle ?? assessment.title}</h1>
              <p className="text-xs text-gray-500">{sectionQuestions.length} questions</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <p className="text-right text-sm font-medium text-gray-700">{user?.displayName}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {sectionConfig && (
            <div className={`rounded-xl border-2 p-5 ${sectionConfig.borderColor} ${sectionConfig.bgColor}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg font-bold text-white text-sm ${sectionConfig.darkBg}`}>
                  {sectionConfig.label}
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${sectionConfig.textColor}`}>
                    {sectionConfig.fullTitle}
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {sectionConfig.description}
                  </p>
                </div>
              </div>
            </div>
          )}

          <WizardProgressBar currentStep={wizard.currentStep} totalSteps={totalSteps} answeredCount={Object.keys(wizard.answers).length} />

          {isOnReviewStep ? (
            <ReviewScreen
              title={sectionConfig?.fullTitle ?? assessment.title}
              questions={sectionQuestions}
              answers={wizard.answers}
              onNavigateToQuestion={(step: number) => {
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
            />
          ) : null}

          {submissionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
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
            />
          )}
        </div>
      </main>
    </div>
  );
}