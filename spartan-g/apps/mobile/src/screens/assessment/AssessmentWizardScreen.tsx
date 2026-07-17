import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import { assessmentService, assessmentOverrideService } from '@spartan-g/shared-services';
import type { AssessmentDocument, WizardState, AssessmentAnswer } from '@spartan-g/shared-types';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';
import { MobileProgressBar } from './components/MobileProgressBar';
import { MobileQuestionCard } from './components/MobileQuestionCard';
import { MobileReviewScreen } from './components/MobileReviewScreen';

type Props = NativeStackScreenProps<StudentMobileStackParamList, 'AssessmentWizard'>;

export function AssessmentWizardScreen({ route, navigation }: Props) {
  const { assessmentId } = route.params;
  const session = useAuthStore((s) => s.session);

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
  const [pendingSave, setPendingSave] = useState(false);

  // Resume state
  const [isResuming, setIsResuming] = useState(false);

  // Came from review (Next should return to review screen)
  const [cameFromReview, setCameFromReview] = useState(false);

  // Confirmation
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isAlreadyCompleted, setIsAlreadyCompleted] = useState(false);

  // Load assessment on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!assessmentId || !session) return;

      try {
        setIsLoading(true);
        setError(null);
        setIsResuming(false);

        const assessmentData = await assessmentService.getAssessmentDefinition(assessmentId);
        if (!assessmentData) {
          setError('Assessment not found. It may have been removed or unpublished.');
          return;
        }

        // Check attempt count — but only count submitted/graded attempts
        const attemptCount = await assessmentService.getAttemptCount(assessmentId, session.uid);
        const effectiveMax = await assessmentOverrideService.getEffectiveMaxAttempts(
          assessmentId,
          session.uid,
          assessmentData.maxAttempts,
        );
        const hasReachedLimit = attemptCount >= effectiveMax;

        // Check for in-progress attempt (this can bypass the limit)
        const existingAttemptId = await assessmentService.getInProgressAttempt(assessmentId, session.uid);

        if (hasReachedLimit && !existingAttemptId) {
          if (!cancelled) {
            setAssessment(assessmentData);
            setIsAlreadyCompleted(true);
            setIsLoading(false);
          }
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
          const newAttemptId = await assessmentService.startAttempt(assessmentId, session.uid);

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
  }, [assessmentId, session]);

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

      setWizard((prev) => ({
        ...prev,
        answers: { ...prev.answers, [currentQuestion.id]: value },
      }));

      // Auto-save
      try {
        setPendingSave(true);
        const now = serverTimestamp() as Timestamp;
        const answer: AssessmentAnswer = {
          questionId: currentQuestion.id,
          value,
          answeredAt: now,
        };
        await assessmentService.saveAnswer(attemptId, answer);
      } catch (err) {
        console.error('[AssessmentWizard] saveAnswer failed:', err);
        setError('Your answer could not be saved. Please check your connection and try again.');
      } finally {
        setPendingSave(false);
      }
    },
    [attemptId, assessment, questions, wizard.currentStep],
  );

  const handlePrevious = useCallback(() => {
    setWizard((prev) => ({ ...prev, currentStep: Math.max(0, prev.currentStep - 1) }));
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

  const handleNavigateToQuestion = useCallback((step: number) => {
    setWizard((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!attemptId) return;

    // Validate all questions have answers before submitting
    const unanswered = questions.filter(
      (q) => wizard.answers[q.id] === undefined || wizard.answers[q.id] === ''
    );
    if (unanswered.length > 0) {
      const firstUnansweredIndex = questions.findIndex(
        (q) => wizard.answers[q.id] === undefined || wizard.answers[q.id] === ''
      );
      setError(`Please answer all questions before submitting — ${unanswered.length} remaining.`);
      if (firstUnansweredIndex >= 0) {
        setWizard((prev) => ({ ...prev, currentStep: firstUnansweredIndex }));
      }
      return;
    }

    setWizard((prev) => ({ ...prev, isSubmitting: true }));

    try {
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
    } catch {
      // Error handled by inline UI
    } finally {
      setWizard((prev) => ({ ...prev, isSubmitting: false }));
    }
  }, [attemptId, questions, wizard.answers]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading assessment...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Unable to Start</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Already completed state
  if (isAlreadyCompleted) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Already Answered</Text>
        <Text style={styles.successMessage}>
          You have already answered the assessment. Your responses have been recorded.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to Assessments</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Submitted state
  if (isSubmitted) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Congratulations!</Text>
        <Text style={styles.successMessage}>
          You've successfully completed your assessment.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Return</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!assessment || !attemptId) return null;

  const currentQuestion = isOnReviewStep ? null : questions[wizard.currentStep];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Resume banner */}
      {isResuming && (
        <View style={styles.resumeBanner}>
          <Text style={styles.resumeBannerText}>
            Resuming your previous attempt — your answers have been restored.
          </Text>
          <TouchableOpacity onPress={() => setIsResuming(false)}>
            <Text style={styles.resumeBannerDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Instructions on first step */}
      {wizard.currentStep === 0 && assessment.instructions && (
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsLabel}>Instructions:</Text>
          <Text style={styles.instructionsText}>{assessment.instructions}</Text>
        </View>
      )}

      {/* Progress */}
      <MobileProgressBar currentStep={wizard.currentStep} totalSteps={totalSteps} answeredCount={Object.keys(wizard.answers).length} />

      {/* Question or Review */}
      {isOnReviewStep ? (
        <MobileReviewScreen
          title={assessment.title}
          questions={questions}
          answers={wizard.answers}
          onNavigateToQuestion={(step: number) => {
            setCameFromReview(true);
            handleNavigateToQuestion(step);
          }}
          onSubmit={handleSubmit}
          isSubmitting={wizard.isSubmitting}
        />
      ) : currentQuestion ? (
        <MobileQuestionCard
          question={currentQuestion}
          selectedAnswer={wizard.answers[currentQuestion.id]}
          onAnswer={handleAnswer}
          isDisabled={wizard.isSubmitting}
        />
      ) : null}

      {/* Navigation */}
      {!isOnReviewStep && (
        <View style={styles.nav}>
          <View style={styles.navLeft}>
            {!isFirstStep && (
              <TouchableOpacity
                onPress={handlePrevious}
                style={[styles.navPrevButton, pendingSave && styles.navButtonDisabled]}
                disabled={pendingSave}
              >
                <Text style={[styles.navPrevText, pendingSave && styles.navButtonTextDisabled]}>Previous</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.navCenter}>
            {pendingSave ? (
              <Text style={styles.savingText}>Saving…</Text>
            ) : (
              <Text style={styles.navCounter}>
                {wizard.currentStep + 1} / {totalSteps}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleNext}
            style={[styles.navNextButton, pendingSave && styles.navButtonDisabled]}
            disabled={pendingSave}
          >
            <Text style={[styles.navNextText, pendingSave && styles.navButtonTextDisabled]}>
              {isLastStep ? 'Review Answers' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.background,
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 8,
  },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconText: {
    fontSize: 28,
    fontWeight: '700',
    color: lightColors.error,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconText: {
    fontSize: 28,
    fontWeight: '700',
    color: lightColors.success,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 8,
  },
  successMessage: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  backButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  resumeBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
  },
  resumeBannerDismiss: {
    marginLeft: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
  instructionsCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    padding: 14,
  },
  instructionsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338CA',
  },
  instructionsText: {
    fontSize: 13,
    color: '#3730A3',
    marginTop: 4,
    lineHeight: 20,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: lightColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: 14,
  },
  navLeft: {
    minWidth: 80,
  },
  navPrevButton: {
    borderWidth: 1.5,
    borderColor: lightColors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  navPrevText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.primary,
  },
  navCounter: {
    fontSize: 14,
    color: lightColors.textSecondary,
    fontWeight: '500',
  },
  navNextButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  navNextText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
  },
  savingText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: lightColors.textMuted,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonTextDisabled: {
    opacity: 0.4,
  },
});
