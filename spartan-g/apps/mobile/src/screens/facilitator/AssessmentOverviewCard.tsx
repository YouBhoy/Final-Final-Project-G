import { View, Text, StyleSheet } from 'react-native';
import type { AssessmentAttemptDocument } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { assessmentOverview } from './assessment-overview';

export function AssessmentOverviewCard({ attempt, title }: { attempt: AssessmentAttemptDocument; title?: string | null }) {
  const overview = assessmentOverview(attempt, title);
  return (
    <View style={styles.card} testID="assessment-system-overview">
      <Text style={styles.title}>System-generated assessment overview</Text>
      {overview.lines.map((line, index) => <Text key={index} style={styles.text}>{line}</Text>)}
      <Text style={styles.notice}>Recorded application data only. Not an AI-generated summary or clinical interpretation. AI summarization remains unavailable in this version.</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: lightColors.text },
  text: { fontSize: 13, lineHeight: 20, color: lightColors.textSecondary },
  notice: { fontSize: 12, lineHeight: 18, color: lightColors.textMuted },
});
