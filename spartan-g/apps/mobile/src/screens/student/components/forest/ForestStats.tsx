import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, fontSize, forestColors, spacing } from '@spartan-g/shared-ui';

// ─── ForestStats ───────────────────────────────────────────────────────────
// Summary tiles for the selected period: check-ins, minutes, healthy trees and
// withered (streak-break) trees. Numbers only — no clinical values.

interface StatTile {
  key: string;
  label: string;
  value: string;
  accent: string;
}

interface ForestStatsProps {
  checkIns: number;
  minutes: number;
  healthyTrees: number;
  witheredTrees: number;
  streakDay: number;
}

function ForestStatsComponent({
  checkIns,
  minutes,
  healthyTrees,
  witheredTrees,
  streakDay,
}: ForestStatsProps) {
  const tiles: StatTile[] = [
    { key: 'checkins', label: 'Check-ins', value: `${checkIns}`, accent: forestColors.grassLight },
    { key: 'minutes', label: 'Minutes', value: `${minutes}`, accent: forestColors.bloomPurple },
    { key: 'healthy', label: 'Healthy', value: `${healthyTrees}`, accent: forestColors.bush },
    {
      key: 'streak',
      label: 'Streak',
      value: streakDay > 1 ? `${streakDay} days` : `${streakDay} day`,
      accent: forestColors.golden,
    },
    {
      key: 'withered',
      label: 'Withered',
      value: `${witheredTrees}`,
      accent: forestColors.bare,
    },
  ];

  return (
    <View style={styles.row}>
      {tiles.map((tile) => (
        <View
          key={tile.key}
          style={styles.tile}
          accessible
          accessibilityLabel={`${tile.label}: ${tile.value}`}
        >
          <View style={[styles.dot, { backgroundColor: tile.accent }]} />
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {tile.value}
          </Text>
          <Text style={styles.label} numberOfLines={1}>
            {tile.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const ForestStats = memo(ForestStatsComponent);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  tile: {
    flex: 1,
    backgroundColor: forestColors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: forestColors.surfaceBorder,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 },
  value: { color: forestColors.text, fontSize: fontSize.md, fontWeight: '700' },
  label: { color: forestColors.textMuted, fontSize: 10, fontWeight: '600' },
});
