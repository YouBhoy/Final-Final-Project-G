import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, fontSize, forestColors, spacing } from '@spartan-g/shared-ui';
import type { ChartBucket } from './forestUtils';

// ─── ActivityChart ─────────────────────────────────────────────────────────
// Simple CSS-free bar chart of check-ins per bucket (hours / days / months,
// depending on the selected period). Drawn with flex Views so it reflows on any
// phone width; one flat bar per bucket keeps it cheap to render.

interface ActivityChartProps {
  buckets: ChartBucket[];
  title: string;
  /** Screen-reader friendly summary, e.g. "3 check-ins this week". */
  summary: string;
}

function ActivityChartComponent({ buckets, title, summary }: ActivityChartProps) {
  const max = useMemo(
    () => Math.max(1, ...buckets.map((b) => b.value)),
    [buckets],
  );

  return (
    <View style={styles.card} accessible accessibilityLabel={`${title}. ${summary}`}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.summary}>{summary}</Text>
      </View>
      <View style={styles.plot}>
        {buckets.map((bucket, index) => {
          const ratio = bucket.value / max;
          return (
            <View key={`${bucket.label}-${index}`} style={styles.column}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(bucket.value > 0 ? 10 : 2, ratio * 100)}%`,
                      opacity: bucket.value > 0 ? 1 : 0.35,
                    },
                  ]}
                />
              </View>
              <Text style={styles.axisLabel} numberOfLines={1}>
                {bucket.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export const ActivityChart = memo(ActivityChartComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: forestColors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: forestColors.surfaceBorder,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: forestColors.text, fontSize: fontSize.sm, fontWeight: '700' },
  summary: { color: forestColors.textMuted, fontSize: 10, fontWeight: '600' },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 74,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: forestColors.axis,
    paddingBottom: 2,
    gap: 2,
  },
  column: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  track: { width: '70%', flex: 1, justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: forestColors.bar, borderRadius: 2 },
  axisLabel: { color: forestColors.textMuted, fontSize: 9, height: 12, marginTop: 2 },
});
