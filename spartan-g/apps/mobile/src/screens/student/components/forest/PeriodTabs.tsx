import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, fontSize, forestColors, spacing } from '@spartan-g/shared-ui';
import { PERIOD_MODES, type PeriodMode, type PeriodRange } from './forestUtils';

// ─── PeriodTabs ────────────────────────────────────────────────────────────
// Day / Week / Month / Year selector with prev/next arrows and the label of
// the period currently on screen. Purely presentational: the screen owns the
// anchor date, this component only reports intent.

const MODE_LABEL: Record<PeriodMode, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

const MODE_HINT: Record<PeriodMode, string> = {
  day: 'Show a single day',
  week: 'Show a single week',
  month: 'Show a single month',
  year: 'Show a single year',
};

interface PeriodTabsProps {
  mode: PeriodMode;
  range: PeriodRange;
  onModeChange: (mode: PeriodMode) => void;
  onShift: (direction: number) => void;
  /** Disable "next" when the range already ends today or later. */
  canGoForward: boolean;
}

function PeriodTabsComponent({
  mode,
  range,
  onModeChange,
  onShift,
  canGoForward,
}: PeriodTabsProps) {
  const goBack = useCallback(() => onShift(-1), [onShift]);
  const goForward = useCallback(() => onShift(1), [onShift]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {PERIOD_MODES.map((item) => {
          const active = item === mode;
          return (
            <Pressable
              key={item}
              onPress={() => onModeChange(item)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={MODE_LABEL[item]}
              accessibilityHint={MODE_HINT[item]}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {MODE_LABEL[item]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.navRow}>
        <Pressable
          onPress={goBack}
          style={styles.arrow}
          accessibilityRole="button"
          accessibilityLabel={`Previous ${mode}`}
          hitSlop={8}
        >
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text style={styles.rangeLabel} numberOfLines={1} accessibilityLabel={`Showing ${range.label}`}>
          {range.label}
        </Text>
        <Pressable
          onPress={goForward}
          style={[styles.arrow, !canGoForward && styles.arrowDisabled]}
          disabled={!canGoForward}
          accessibilityRole="button"
          accessibilityLabel={`Next ${mode}`}
          accessibilityState={{ disabled: !canGoForward }}
          hitSlop={8}
        >
          <Text style={[styles.arrowText, !canGoForward && styles.arrowTextDisabled]}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const PeriodTabs = memo(PeriodTabsComponent);

const styles = StyleSheet.create({
  wrapper: { width: '100%', gap: spacing.sm },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: forestColors.chip,
    borderRadius: borderRadius.full,
    padding: 3,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  tabActive: { backgroundColor: forestColors.chipActive },
  tabText: { color: forestColors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  tabTextActive: { color: forestColors.text },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: forestColors.chip,
  },
  arrowDisabled: { opacity: 0.35 },
  arrowText: {
    color: forestColors.text,
    fontSize: fontSize.xl,
    lineHeight: fontSize.xl + 4,
    fontWeight: '700',
  },
  arrowTextDisabled: { color: forestColors.textMuted },
  rangeLabel: {
    flex: 1,
    textAlign: 'center',
    color: forestColors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
