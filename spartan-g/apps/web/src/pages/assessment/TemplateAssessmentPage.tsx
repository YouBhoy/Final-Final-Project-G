import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useAssessmentQuestions } from "../../hooks/useAssessmentQuestions";
import { assessmentService, assessmentResponseService } from "@spartan-g/shared-services";
import type { AssessmentDocument, AssessmentResponseValue } from "@spartan-g/shared-types";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { TemplateQuestionCard } from "../../components/assessment/TemplateQuestionCard";

type AnswerMap = Record<string, AssessmentResponseValue>;

export function TemplateAssessmentPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Assessment attempt shell
  const [assessment, setAssessment] = useState<(AssessmentDocument & { id: string }) | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Questions from the template (Phase 3A uses separate questions collection)
  const { data: questions, loading: questionsLoading, error: questionsError } =
    useAssessmentQuestions(templateId);

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load the assessment document on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!assessmentId || !user) return;

      try {
        setIsLoading(true);
        setError(null);

        const asmt = await assessmentService.getAssessment(assessmentId, user.role);
        if (!asmt) {
          setError("Assessment not found. It may have been removed.");
          return;
        }

        // Verify ownership
        if (asmt.studentId !== user.uid) {
          setError("This assessment does not belong to you.");
          return;
        }

        // Check status
        if (asmt.status !== "in_progress") {
          setError("This assessment has already been submitted.");
          return;
        }

        if (!cancelled) {
          setAssessment(asmt);
          setTemplateId(asmt.templateId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load assessment");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [assessmentId, user]);

  // Load saved responses when questions are ready
  useEffect(() => {
    let cancelled = false;

    async function loadResponses() {
      if (!assessmentId || !user || questions.length === 0) return;

      try {
        const savedResponses = await assessmentResponseService.getResponsesForAssessment(
          assessmentId,
          user.role,
        );

        const restored: AnswerMap = {};
        for (const r of savedResponses) {
          restored[r.questionId] = r.value;
        }

        if (!cancelled) {
          setAnswers(restored);
        }
      } catch (err) {
        console.error("Failed to load saved responses:", err);
      }
    }

    loadResponses();
    return () => {
      cancelled = true;
    };
  }, [assessmentId, user, questions]);

  // Auto-save a response whenever the student answers a question
  const handleAnswer = useCallback(
    async (value: AssessmentResponseValue) => {
      if (!assessmentId || !user || !assessment) return;

      const currentQuestion = questions[currentStep];
      if (!currentQuestion) return;

      // Update local state immediately
      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: value }));
      setSaveError(null);

      // Auto-save to Firestore
      try {
        await assessmentResponseService.saveResponse(
          {
            assessmentId,
            questionId: currentQuestion.id,
            studentId: user.uid,
            value,
          },
          user.role,
        );
      } catch (err) {
        setSaveError("Failed to save your answer. Check your connection.");
        console.error("saveResponse failed:", err);
      }
    },
    [assessmentId, user, assessment, questions, currentStep],
  );

  const handleNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(questions.length, prev + 1));
  }, [questions.length]);

  const handlePrevious = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNavigateToQuestion = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!assessmentId || !user || !assessment) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      await assessmentService.submitAssessment(assessmentId, user.uid, user.role);
      setIsSubmitted(true);
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : "Failed to submit assessment");
    } finally {
      setIsSubmitting(false);
    }
  }, [assessmentId, user, assessment]);

  const totalSteps = questions.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep >= totalSteps - 1;
  const isOnReviewStep = currentStep >= totalSteps;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading assessment..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
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
              to="/student/assessments"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Back to Assessments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Submitted / Confirmation state
  if (isSubmitted) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="rounded-xl border border-gray-200 bg-white p-12 shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">Assessment Submitted!</h2>
          <p className="mt-2 text-sm text-gray-500">
            Your responses have been recorded successfully.
          </p>
          <div className="mt-8">
            <Button variant="primary" onClick={() => navigate("/student/assessments")}>
              Back to Assessments
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!assessment || questionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading questions..." />
      </div>
    );
  }

  if (questionsError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load questions: {questionsError.message}
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-gray-500">This assessment has no questions yet.</p>
        <div className="mt-6">
          <Link
            to="/student/assessments"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Back to Assessments
          </Link>
        </div>
      </div>
    );
  }

  const currentQuestion = isOnReviewStep ? null : questions[currentStep];
  
  // Calculate answered count for Review & Submit button
  const answeredCount = Object.keys(answers).filter(key => {
    const answer = answers[key];
    return answer !== undefined && answer !== "" && !(Array.isArray(answer) && (answer as unknown[]).length === 0);
  }).length;
  const allQuestionsAnswered = answeredCount === totalSteps;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {assessment.templateId ? "Check-in Assessment" : "Assessment"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalSteps} {totalSteps === 1 ? "question" : "questions"}
          </p>
        </div>

        {/* Question Navigation Grid */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Question Navigation</h3>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {questions.map((q, idx) => {
              const answer = answers[q.id];
              const isAnswered = answer !== undefined && answer !== "" && !(Array.isArray(answer) && (answer as readonly unknown[]).length === 0);
              const isCurrent = currentStep === idx;
              
              return (
                <button
                  key={q.id}
                  onClick={() => handleNavigateToQuestion(idx)}
                  className={`
                    relative flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150
                    ${isCurrent 
                      ? 'ring-2 ring-indigo-500 ring-offset-2 bg-indigo-50 text-indigo-700' 
                      : isAnswered 
                        ? 'bg-green-50 text-green-700 hover:bg-green-100' 
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }
                  `}
                >
                  {isAnswered && !isCurrent && (
                    <svg className="absolute -top-1 -right-1 h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Save error banner */}
        {saveError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {saveError}
          </div>
        )}

        {/* Progress bar */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {isOnReviewStep ? "Review" : `Question ${currentStep + 1} of ${totalSteps}`}
            </span>
            <span>{Math.round((Object.keys(answers).length / totalSteps) * 100)}% complete</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
              style={{
                width: `${(Object.keys(answers).length / totalSteps) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Question or Review Screen */}
        {isOnReviewStep ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Review Your Answers</h2>
            {questions.map((q, idx) => {
              const rawAnswer = answers[q.id];
              const isAnswered = rawAnswer !== undefined && rawAnswer !== "" && !(Array.isArray(rawAnswer) && rawAnswer.length === 0);
              const displayValue = Array.isArray(rawAnswer) ? rawAnswer.join(", ") : String(rawAnswer ?? "");

              return (
                <div
                  key={q.id}
                  className={`rounded-xl border p-4 shadow-sm ${
                    isAnswered ? "border-gray-200 bg-white" : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {idx + 1}. {q.prompt}
                      </p>
                      <p className={`mt-1 text-sm ${isAnswered ? "text-gray-600" : "font-semibold text-red-600"}`}>
                        {isAnswered ? `Answer: ${displayValue || "(empty)"}` : "No answer"}
                      </p>
                      {q.isRequired && !isAnswered && (
                        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Required
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNavigateToQuestion(idx)}
                      className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                </div>
              );
            })}

            {submissionError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                {submissionError}
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleSubmit}
              isLoading={isSubmitting}
            >
              Submit Assessment
            </Button>
          </div>
        ) : currentQuestion ? (
          <TemplateQuestionCard
            question={currentQuestion}
            selectedAnswer={answers[currentQuestion.id]}
            onAnswer={handleAnswer}
            isDisabled={isSubmitting}
          />
        ) : null}

        {/* Navigation (hidden during review screen) */}
        {!isOnReviewStep && (
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
            <div>
              {!isFirstStep && (
                <Button variant="outline" onClick={handlePrevious}>
                  Previous
                </Button>
              )}
            </div>
            <div className="text-sm text-gray-500">
              {currentStep + 1} / {totalSteps}
            </div>
            <div className="flex gap-2">
              {allQuestionsAnswered && (
                <Button 
                  variant="primary" 
                  onClick={() => setCurrentStep(totalSteps)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Review & Submit
                </Button>
              )}
              <Button variant="primary" onClick={handleNext}>
                {isLastStep ? "Review Answers" : "Next"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}