import { View, Text, StyleSheet } from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';

interface MobileProgressBarProps {
  currentStep: number;
  totalSteps: number;
  answeredCount: number;
}

export function MobileProgressBar({ currentStep, totalSteps, answeredCount }: MobileProgressBarProps) {
  const percentage = totalSteps > 0 ? Math.round((answeredCount / totalSteps) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Question {currentStep + 1} of {totalSteps}</Text>
        <Text style={styles.percentage}>{percentage}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percentage}%` as any }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.text,
  },
  percentage: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  track: {
    height: 8,
    backgroundColor: lightColors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: lightColors.primary,
    borderRadius: 4,
  },
});