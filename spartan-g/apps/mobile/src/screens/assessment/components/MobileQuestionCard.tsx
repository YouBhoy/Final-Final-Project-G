import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';
import type { AssessmentQuestion } from '@spartan-g/shared-types';

interface MobileQuestionCardProps {
  question: AssessmentQuestion;
  selectedAnswer: string | undefined;
  onAnswer: (value: string) => void;
  isDisabled?: boolean;
}

export function MobileQuestionCard({
  question,
  selectedAnswer,
  onAnswer,
  isDisabled,
}: MobileQuestionCardProps) {
  function renderMultipleChoice() {
    return (
      <View style={styles.optionsContainer}>
        {question.options?.map((option) => {
          const isSelected = selectedAnswer === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => onAnswer(option.id)}
              disabled={isDisabled}
              style={[
                styles.optionButton,
                isSelected ? styles.optionSelected : styles.optionUnselected,
              ]}
              accessibilityState={{ selected: isSelected }}
            >
              <View style={[styles.optionCircle, isSelected && styles.optionCircleSelected]}>
                <Text style={[styles.optionLetter, isSelected && styles.optionLetterSelected]}>
                  {option.id.toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  function renderTrueFalse() {
    return (
      <View style={styles.tfContainer}>
        {['True', 'False'].map((label) => {
          const value = label.toLowerCase();
          const isSelected = selectedAnswer === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => onAnswer(value)}
              disabled={isDisabled}
              style={[
                styles.tfButton,
                { flex: 1 },
                isSelected ? styles.optionSelected : styles.optionUnselected,
              ]}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.tfText, isSelected && styles.optionTextSelected]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  function renderShortAnswer() {
    return (
      <TextInput
        value={selectedAnswer ?? ''}
        onChangeText={onAnswer}
        editable={!isDisabled}
        placeholder="Type your answer here..."
        placeholderTextColor={lightColors.textMuted}
        multiline
        numberOfLines={4}
        style={styles.textArea}
        textAlignVertical="top"
      />
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.questionNumber}>Question {question.order}</Text>
        <View style={styles.pointsBadge}>
          <Text style={styles.pointsText}>
            {question.points} {question.points === 1 ? 'point' : 'points'}
          </Text>
        </View>
      </View>

      <Text style={styles.questionText}>{question.text}</Text>

      {question.type === 'multiple_choice'
        ? renderMultipleChoice()
        : question.type === 'true_false'
        ? renderTrueFalse()
        : renderShortAnswer()}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: 20,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  questionNumber: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: lightColors.textMuted,
  },
  pointsBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pointsText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338CA',
  },
  questionText: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    color: lightColors.text,
    marginBottom: 20,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 50,
  },
  optionUnselected: {
    backgroundColor: lightColors.surface,
    borderColor: lightColors.border,
  },
  optionSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: lightColors.primary,
    borderWidth: 2,
  },
  optionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: lightColors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionCircleSelected: {
    borderColor: lightColors.primary,
    backgroundColor: lightColors.primary,
  },
  optionLetter: {
    fontSize: 11,
    fontWeight: '700',
    color: lightColors.textMuted,
  },
  optionLetterSelected: {
    color: '#FFFFFF',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500',
    color: lightColors.text,
    flex: 1,
  },
  optionTextSelected: {
    color: '#4338CA',
  },
  tfContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  tfButton: {
    paddingVertical: 18,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  tfText: {
    fontSize: 16,
    fontWeight: '700',
  },
  textArea: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: lightColors.text,
    backgroundColor: lightColors.surface,
    minHeight: 100,
    lineHeight: 22,
  },
});