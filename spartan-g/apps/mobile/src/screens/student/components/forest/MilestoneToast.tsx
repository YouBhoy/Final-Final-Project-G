import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { borderRadius, fontSize, forestColors, spacing } from '@spartan-g/shared-ui';

// ─── MilestoneToast ────────────────────────────────────────────────────────
// Small celebration banner for the 1st / 10th / 50th check-in (and any future
// milestone). Auto-dismisses; honours reduced-motion by appearing without the
// slide/scale animation.

interface MilestoneToastProps {
  visible: boolean;
  title: string;
  message: string;
  reducedMotion: boolean;
  onHide: () => void;
  /** How long the banner stays on screen. */
  duration?: number;
}

export function MilestoneToast({
  visible,
  title,
  message,
  reducedMotion,
  onHide,
  duration = 3600,
}: MilestoneToastProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    if (reducedMotion) {
      progress.setValue(1);
    } else {
      Animated.spring(progress, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }).start();
    }
    const timer = setTimeout(onHide, duration);
    return () => clearTimeout(timer);
  }, [visible, reducedMotion, duration, onHide, progress]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
          ],
        },
      ]}
      accessibilityLiveRegion="polite"
      accessible
      accessibilityLabel={`${title}. ${message}`}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>★</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.sm,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: forestColors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: forestColors.golden,
    padding: spacing.sm,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: forestColors.golden,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: forestColors.bgDeep, fontSize: fontSize.md, fontWeight: '700' },
  textWrap: { flex: 1 },
  title: { color: forestColors.text, fontSize: fontSize.sm, fontWeight: '700' },
  message: { color: forestColors.textSecondary, fontSize: fontSize.xs, marginTop: 1 },
});
