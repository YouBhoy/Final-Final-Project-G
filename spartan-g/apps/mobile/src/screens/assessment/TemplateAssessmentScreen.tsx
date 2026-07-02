import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList, AssessmentQuestionDocument, AssessmentResponseValue } from '@spartan-g/shared-types';
import { assessmentService, assessmentResponseService, assessmentQuestionRepository, useAuthStore } from '@spartan-g/shared-services';
import type { AssessmentDocument } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';

type Props = NativeStackScreenProps<StudentMobileStackParamList, 'AssessmentWizard'>;

type AnswerMap = Record<string, AssessmentResponseValue>;

export function TemplateAssessmentScreen({ route, navigation }: Props) {
  const { assessmentId } = route.params;
  const session = useAuthStore((s) => s.session);

  // Assessment document
  const [assessment, setAssessment] = useState<(AssessmentDocument & { id: string }) | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Questions from the template
  const [questions, setQuestions] = useState<(AssessmentQuestionDocument & { id: string })[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

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
      if (!assessmentId || !session) return;

      try {
        setIsLoading(true);
        setError(null);

        const asmt = await assessmentService.getAssessment(assessmentId, session.role);
        if (!asmt) {
          setError('Assessment not found. It may have been removed.');
          return;
        }

        // Verify ownership
        if (asmt.studentId !== session.uid) {
          setError('This assessment does not belong to you.');
          return;
        }

        // Check status
        if (asmt.status !== 'in_progress') {
          setError('This assessment has already been submitted.');
          return;
        }

        if (!cancelled) {
          setAssessment(asmt);
          setTemplateId(asmt.templateId);
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

  // Load questions when templateId is known
  useEffect(() => {
    let cancelled = false;

    async function loadQuestions() {
      if (!templateId) return;

      try {
        setQuestionsLoading(true);
        setQuestionsError(null);
        const qs = await assessmentQuestionRepository.getByTemplate(templateId);
        if (!cancelled) {
          setQuestions(qs);
        }
      } catch (err) {
        if (!cancelled) {
          setQuestionsError(err instanceof Error ? err.message : 'Failed to load questions');
        }
      } finally {
        if (!cancelled) {
          setQuestionsLoading(false);
        }
      }
    }

    loadQuestions();
    return () => { cancelled = true; };
  }, [templateId]);

  // Load saved responses when questions are ready
  useEffect(() => {
    let cancelled = false;

    async function loadResponses() {
      if (!assessmentId || !session || questions.length === 0) return;

      try {
        const savedResponses = await assessmentResponseService.getResponsesForAssessment(
          assessmentId,
          session.role,
        );

        const restored: AnswerMap = {};
        for (const r of savedResponses) {
          restored[r.questionId] = r.value;
        }

        if (!cancelled) {
          setAnswers(restored);
        }
      } catch {
        // Silently fail — responses will be empty
      }
    }

    loadResponses();
    return () => { cancelled = true; };
  }, [assessmentId, session, questions]);

  const totalSteps = questions.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep >= totalSteps - 1;
  const isOnReviewStep = currentStep >= totalSteps;

  const handleAnswer = useCallback(
    async (value: AssessmentResponseValue) => {
      if (!assessmentId || !session || !assessment) return;

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
            studentId: session.uid,
            value,
          },
          session.role,
        );
      } catch {
        setSaveError('Failed to save your answer. Check your connection.');
      }
    },
    [assessmentId, session, assessment, questions, currentStep],
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
    if (!assessmentId || !session || !assessment) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      await assessmentService.submitAssessment(assessmentId, session.uid, session.role);
      setIsSubmitted(true);
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : 'Failed to submit assessment');
    } finally {
      setIsSubmitting(false);
    }
  }, [assessmentId, session, assessment]);

  // ─── Loading state ──────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading assessment...</Text>
      </View>
    );
  }

  // ─── Error state ────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Unable to Start</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to Assessments</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Submitted state ────────────────────────────────────
  if (isSubmitted) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Assessment Submitted!</Text>
        <Text style={styles.successMessage}>
          Your responses have been recorded successfully.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to Assessments</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!assessment || questionsLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading questions...</Text>
      </View>
    );
  }

  if (questionsError) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Failed to Load Questions</Text>
        <Text style={styles.errorMessage}>{questionsError}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>This assessment has no questions yet.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentQuestion = isOnReviewStep ? null : questions[currentStep];
  const answeredCount = Object.keys(answers).length;
  const progressPercent = Math.round((answeredCount / totalSteps) * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View>
        <Text style={styles.title}>Check-in Assessment</Text>
        <Text style={styles.subtitle}>
          {totalSteps} {totalSteps === 1 ? 'question' : 'questions'}
        </Text>
      </View>

      {/* Save error banner */}
      {saveError && (
        <View style={styles.saveErrorBanner}>
          <Text style={styles.saveErrorText}>{saveError}</Text>
        </View>
      )}

      {/* Progress bar */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            {isOnReviewStep ? 'Review' : `Question ${currentStep + 1} of ${totalSteps}`}
          </Text>
          <Text style={styles.progressPercent}>{progressPercent}% complete</Text>
        </View>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* Question or Review Screen */}
      {isOnReviewStep ? (
        <View style={styles.reviewSection}>
          <Text style={styles.reviewTitle}>Review Your Answers</Text>
          {questions.map((q, idx) => {
            const rawAnswer = answers[q.id];
            const isAnswered = rawAnswer !== undefined && rawAnswer !== '' &&
              !(Array.isArray(rawAnswer) && rawAnswer.length === 0);
            const displayValue = Array.isArray(rawAnswer)
              ? rawAnswer.join(', ')
              : String(rawAnswer ?? '');

            return (
              <View
                key={q.id}
                style={[
                  styles.reviewCard,
                  isAnswered ? styles.reviewCardAnswered : styles.reviewCardUnanswered,
                ]}
              >
                <View style={styles.reviewCardContent}>
                  <View style={styles.reviewCardText}>
                    <Text style={styles.reviewQuestionText}>
                      {idx + 1}. {q.prompt}
                    </Text>
                    <Text style={[styles.reviewAnswerText, !isAnswered && styles.reviewAnswerMissing]}>
                      {isAnswered ? `Answer: ${displayValue || '(empty)'}` : 'No answer'}
                    </Text>
                    {q.isRequired && !isAnswered && (
                      <View style={styles.requiredBadge}>
                        <Text style={styles.requiredBadgeText}>Required</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleNavigateToQuestion(idx)}
                    style={styles.changeButton}
                  >
                    <Text style={styles.changeButtonText}>Change</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {submissionError && (
            <View style={styles.submissionErrorBanner}>
              <Text style={styles.submissionErrorText}>{submissionError}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Assessment</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : currentQuestion ? (
        <View style={styles.questionCard}>
          <View style={styles.questionHeader}>
            <Text style={styles.questionType}>
              {currentQuestion.type === 'short_text' ? 'Short text' :
               currentQuestion.type === 'long_text' ? 'Long text' :
               currentQuestion.type === 'single_choice' ? 'Single choice' :
               currentQuestion.type === 'multi_choice' ? 'Multi choice' :
               currentQuestion.type === 'scale_1_5' ? 'Scale 1–5' :
               currentQuestion.type === 'scale_1_10' ? 'Scale 1–10' :
               currentQuestion.type === 'yes_no' ? 'Yes / No' :
               currentQuestion.type ?? 'Question'}
            </Text>
            {currentQuestion.isRequired && (
              <View style={styles.requiredBadge}>
                <Text style={styles.requiredBadgeText}>Required</Text>
              </View>
            )}
          </View>
          <Text style={styles.questionPrompt}>{currentQuestion.prompt}</Text>

          {/* Answer input based on question type */}
          {currentQuestion.type === 'yes_no' && (
            <View style={styles.choiceRow}>
              {['Yes', 'No'].map((opt) => {
                const selected = answers[currentQuestion.id] === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => handleAnswer(opt)}
                    style={[styles.choiceOption, selected && styles.choiceOptionSelected]}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {(currentQuestion.type === 'single_choice' || currentQuestion.type === 'multi_choice') &&
            currentQuestion.options && (
            <View style={styles.choiceList}>
              {currentQuestion.options.map((opt) => {
                const currentAnswer = answers[currentQuestion.id];
                const selected = currentQuestion.type === 'multi_choice'
                  ? Array.isArray(currentAnswer) && currentAnswer.includes(opt)
                  : currentAnswer === opt;

                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => {
                      if (currentQuestion.type === 'multi_choice') {
                        const current = Array.isArray(answers[currentQuestion.id])
                          ? [...answers[currentQuestion.id] as string[]]
                          : [];
                        const updated = selected
                          ? current.filter((v) => v !== opt)
                          : [...current, opt];
                        handleAnswer(updated);
                      } else {
                        handleAnswer(opt);
                      }
                    }}
                    style={[styles.choiceOption, selected && styles.choiceOptionSelected]}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {currentQuestion.type === 'scale_1_5' && (
            <View style={styles.scaleRow}>
              {[1, 2, 3, 4, 5].map((val) => {
                const selected = answers[currentQuestion.id] === String(val);
                return (
                  <TouchableOpacity
                    key={val}
                    onPress={() => handleAnswer(String(val))}
                    style={[styles.scaleOption, selected && styles.scaleOptionSelected]}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.scaleText, selected && styles.scaleTextSelected]}>
                      {val}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {currentQuestion.type === 'scale_1_10' && (
            <View style={styles.scaleRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
                const selected = answers[currentQuestion.id] === String(val);
                return (
                  <TouchableOpacity
                    key={val}
                    onPress={() => handleAnswer(String(val))}
                    style={[styles.scaleOption, selected && styles.scaleOptionSelected]}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.scaleText, selected && styles.scaleTextSelected]}>
                      {val}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {/* Navigation (hidden during review screen) */}
      {!isOnReviewStep && (
        <View style={styles.nav}>
          <View style={styles.navLeft}>
            {!isFirstStep && (
              <TouchableOpacity onPress={handlePrevious} style={styles.navPrevButton}>
                <Text style={styles.navPrevText}>Previous</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.navCounter}>
            {currentStep + 1} / {totalSteps}
          </Text>
          <TouchableOpacity onPress={handleNext} style={styles.navNextButton}>
            <Text style={styles.navNextText}>
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
  emptyText: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: lightColors.text,
  },
  subtitle: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 2,
  },
  saveErrorBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    padding: 10,
  },
  saveErrorText: {
    fontSize: 13,
    color: '#92400E',
  },
  progressCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  progressPercent: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: lightColors.border,
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: lightColors.primary,
  },
  questionCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  questionType: {
    fontSize: 11,
    fontWeight: '600',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  questionPrompt: {
    fontSize: 16,
    fontWeight: '600',
    color: lightColors.text,
    lineHeight: 22,
    marginBottom: 16,
  },
  requiredBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  requiredBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#991B1B',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  choiceList: {
    gap: 8,
  },
  choiceOption: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  choiceOptionSelected: {
    borderColor: lightColors.primary,
    backgroundColor: '#FEE2E2',
  },
  choiceText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.textSecondary,
  },
  choiceTextSelected: {
    color: '#991B1B',
  },
  scaleRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  scaleOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: lightColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleOptionSelected: {
    borderColor: lightColors.primary,
    backgroundColor: lightColors.primary,
  },
  scaleText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.textSecondary,
  },
  scaleTextSelected: {
    color: '#FFFFFF',
  },
  reviewSection: {
    gap: 12,
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
  },
  reviewCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  reviewCardAnswered: {
    borderColor: lightColors.border,
    backgroundColor: lightColors.surface,
  },
  reviewCardUnanswered: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  reviewCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  reviewCardText: {
    flex: 1,
  },
  reviewQuestionText: {
    fontSize: 14,
    fontWeight: '500',
    color: lightColors.text,
    lineHeight: 20,
  },
  reviewAnswerText: {
    fontSize: 13,
    color: lightColors.textSecondary,
    marginTop: 4,
  },
  reviewAnswerMissing: {
    color: lightColors.error,
    fontWeight: '600',
  },
  changeButton: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.primary,
  },
  submissionErrorBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
  },
  submissionErrorText: {
    fontSize: 13,
    color: '#B91C1C',
  },
  submitButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
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
});