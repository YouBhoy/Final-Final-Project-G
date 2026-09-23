import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { borderRadius, forestColors, spacing } from '@spartan-g/shared-ui';

// ─── ForestSkeleton ────────────────────────────────────────────────────────
// Loading placeholder that mirrors the real layout (title, subtitle, period
// pill, diamond island, stats row, chart) so the swap to real content is calm.
// Owns a single native-driven opacity loop — no per-frame JS work.

function ForestSkeletonComponent() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });

  return (
    <View style={styles.wrap} accessibilityLabel="Loading your forest" accessible>
      <Animated.View style={[styles.line, styles.title, { opacity }]} />
      <Animated.View style={[styles.line, styles.subtitle, { opacity }]} />
      <Animated.View style={[styles.pill, { opacity }]} />
      <Animated.View style={[styles.diamond, { opacity }]} />
      <View style={styles.statsRow}>
        {[0, 1, 2, 3].map((i) => (
          <Animated.View key={i} style={[styles.stat, { opacity }]} />
        ))}
      </View>
      <Animated.View style={[styles.chart, { opacity }]} />
    </View>
  );
}

export const ForestSkeleton = memo(ForestSkeletonComponent);

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: spacing.md, gap: spacing.sm, alignItems: 'center' },
  line: { backgroundColor: forestColors.chip, borderRadius: borderRadius.sm },
  title: { width: 150, height: 22, alignSelf: 'flex-start' },
  subtitle: { width: 220, height: 14, alignSelf: 'flex-start' },
  pill: { width: 180, height: 32, borderRadius: borderRadius.full, marginTop: spacing.sm },
  diamond: {
    width: 240,
    height: 120,
    marginTop: spacing.md,
    backgroundColor: forestColors.chip,
    borderRadius: borderRadius.lg,
  },
  statsRow: { flexDirection: 'row', gap: spacing.xs, alignSelf: 'stretch' },
  stat: { flex: 1, height: 54, borderRadius: borderRadius.lg, backgroundColor: forestColors.chip },
  chart: { alignSelf: 'stretch', height: 110, borderRadius: borderRadius.lg, backgroundColor: forestColors.chip },
});
