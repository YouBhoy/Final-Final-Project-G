import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { MAX_ZOOM, MIN_ZOOM } from './forestLayout';

// ─── ForestCanvas ──────────────────────────────────────────────────────────
// Pinch-to-zoom viewport (disabled for tiny forests / reduced motion). Trees
// still receive taps while idle — and during an active pinch, the second
// finger's tap is ignored by React Native's own gesture arbitration.
//
// Only transform values animate here and only while a gesture is active, so
// idle rendering costs zero JS work.

interface ForestCanvasProps {
  children: ReactNode;
  viewportWidth: number;
  viewportHeight: number;
  /** False for tiny forests (or reduced motion) — gestures are a no-op then. */
  enabled: boolean;
}

function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export function ForestCanvas({
  children,
  viewportWidth,
  viewportHeight,
  enabled,
}: ForestCanvasProps) {
  const scale = useRef(new Animated.Value(1)).current;

  // Gesture baseline + current scale (ref only — a pinch never re-renders).
  const gesture = useRef({
    scale: 1,
    pinchStart: 0,
    pinchScale: 1,
  });

  // Snap back into the allowed zoom band when the gesture is disabled or ends.
  useMemo(() => {
    if (!enabled) {
      gesture.current.scale = 1;
      gesture.current.pinchStart = 0;
      gesture.current.pinchScale = 1;
      scale.setValue(1);
    }
  }, [enabled, scale]);

  const settle = () => {
    const clamped = enabled ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, gesture.current.scale)) : 1;
    gesture.current.scale = clamped;
    Animated.spring(scale, { toValue: clamped, useNativeDriver: true, friction: 9 }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // Claim the gesture ONLY for a two-finger pinch. Single-finger drags
        // stay with the parent ScrollView (vertical scroll) and tree taps
        // (Pressable) — the island never swallows them, so taps always fire.
        onMoveShouldSetPanResponder: (evt) => enabled && evt.nativeEvent.touches.length > 1,
        onPanResponderGrant: () => {
          gesture.current.pinchStart = 0;
          gesture.current.pinchScale = gesture.current.scale;
        },
        onPanResponderMove: (evt) => {
          const touches = evt.nativeEvent.touches as unknown as {
            pageX: number;
            pageY: number;
          }[];
          if (touches.length < 2) return;
          const distance = touchDistance(touches);
          if (gesture.current.pinchStart === 0) {
            gesture.current.pinchStart = distance || 1;
            gesture.current.pinchScale = gesture.current.scale;
            return;
          }
          const ratio = distance / gesture.current.pinchStart;
          const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, gesture.current.pinchScale * ratio));
          gesture.current.scale = next;
          scale.setValue(next);
        },
        onPanResponderRelease: () => {
          gesture.current.pinchStart = 0;
          settle();
        },
        onPanResponderTerminate: () => {
          gesture.current.pinchStart = 0;
          settle();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, scale],
  );

  return (
    <View
      style={[styles.viewport, { width: viewportWidth, height: viewportHeight }]}
      {...panResponder.panHandlers}
    >
      <Animated.View style={[styles.content, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', justifyContent: 'center' },
});
