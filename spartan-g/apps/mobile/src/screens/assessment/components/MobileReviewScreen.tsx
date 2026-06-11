import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';
import type { AssessmentQuestion } from '@spartan-g/shared-types';

interface MobileReviewScreenProps {
  title: string;
  questions: AssessmentQuestion[];
  answers: Record<string, string>;
  onNavigateToQuestion: (step: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function MobileReviewScreen({
  title,
  questions,
  answers,
  onNavigateToQuestion,
  onSubmit,
  isSubmitting,
}: MobileReviewScreenProps) {
  const answeredCount = questions.filter(
    (q) => answers[q.id] !== undefined && answers[q.id] !== '',
  ).length;
  const totalCount = questions.length;
  const hasUnanswered = answeredCount < totalCount;

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Review Your Answers</Text>
        <Text style={styles.headerSubtitle}>{title}</Text>
        <View style={styles.progressRow}>
          <Text
            style={[
              styles.progressText,
              { color: hasUnanswered ? lightColors.error : lightColors.success },
            ]}
          >
            {answeredCount} of {totalCount} answered
          </Text>
          {hasUnanswered && (
            <View style={styles.unansweredBadge}>
              <Text style={styles.unansweredText}>
                {totalCount - answeredCount} unanswered
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Question review list */}
      <View style={styles.list}>
        {questions.map((question, index) => {
          const answer = answers[question.id];
          const isAnswered = answer !== undefined && answer !== '';

          return (
            <View
              key={question.id}
              style={[
                styles.reviewItem,
                isAnswered ? styles.reviewItemAnswered : styles.reviewItemUnanswered,
              ]}
            >
              <View style={styles.reviewItemContent}>
                <View style={styles.reviewItemHeader}>
                  <Text style={styles.reviewQNumber}>Q{question.order}</Text>
                  <View style={styles.reviewPointsBadge}>
                    <Text style={styles.reviewPointsText}>{question.points} pts</Text>
                  </View>
                </View>
                <Text style={styles.reviewQuestionText} numberOfLines={2}>
                  {question.text}
                </Text>
                <Text
                  style={[
                    styles.reviewAnswerText,
                    { color: isAnswered ? lightColors.textSecondary : lightColors.error },
                  ]}
                  numberOfLines={1}
                >
                  {isAnswered ? `Answer: ${answer}` : 'No answer'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onNavigateToQuestion(index)}
                style={styles.changeButton}
              >
                <Text style={styles.changeButtonText}>Change</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* Warning */}
      {hasUnanswered && (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            You have unanswered questions. You can still submit, but unanswered
            questions will receive no points.
          </Text>
        </View>
      )}

      {/* Submit button */}
      <TouchableOpacity
        onPress={onSubmit}
        disabled={isSubmitting}
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Submitting...' : 'Submit Assessment'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: lightColors.textSecondary,
    marginTop: 4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
  },
  unansweredBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  unansweredText: {
    fontSize: 12,
    fontWeight: '600',
    color: lightColors.error,
  },
  list: {
    gap: 10,
  },
  reviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  reviewItemAnswered: {
    backgroundColor: lightColors.surface,
    borderColor: lightColors.border,
  },
  reviewItemUnanswered: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  reviewItemContent: {
    flex: 1,
    marginRight: 12,
  },
  reviewItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  reviewQNumber: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: lightColors.textMuted,
  },
  reviewPointsBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  reviewPointsText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4338CA',
  },
  reviewQuestionText: {
    fontSize: 14,
    fontWeight: '500',
    color: lightColors.text,
    marginTop: 2,
  },
  reviewAnswerText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  changeButton: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: lightColors.surface,
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4338CA',
  },
  warningCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 14,
  },
  warningText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});