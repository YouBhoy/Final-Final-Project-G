import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';

interface GardenTreeProps {
  totalQuestions: number;
  answeredCount: number;
}

// ─── Deterministic leaf layout (golden-angle sunflower spiral) ─────────────
// Same (index, totalQuestions) always produces the same (x, y, size).
// No randomness between renders.

const CANOPY_HEIGHT = 150;
const MAX_RADIUS = 55;

function getLeafPosition(index: number, totalQuestions: number, canopyWidth: number) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~2.39996 rad
  const angle = index * goldenAngle;
  const radius =
    totalQuestions > 1
      ? Math.sqrt(index / (totalQuestions - 1)) * MAX_RADIUS
      : 0;
  const centerX = canopyWidth / 2;
  const centerY = CANOPY_HEIGHT / 2;
  return {
    x: centerX + Math.cos(angle) * radius - 6,
    y: centerY + Math.sin(angle) * radius * 0.8 - 6,
    size: 10 + (index % 3) * 2,
  };
}

export function GardenTree({ totalQuestions, answeredCount }: GardenTreeProps) {
  // Measure the actual container width so leaves stay centered on any device.
  const [canopyWidth, setCanopyWidth] = useState(220);
  const [animatedLeafIndex, setAnimatedLeafIndex] = useState<number | null>(null);

  // Animated values live for the component's lifetime. Leaves stay as
  // <Animated.View> permanently (values rest at 1/1 when not animating).
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // CRITICAL: initialized to the CURRENT answeredCount on mount so restored/
  // loaded progress renders already-grown with no animation. Only a live
  // increase triggers the pop-in.
  const prevAnsweredCountRef = useRef(answeredCount);

  const leafCount = Math.max(0, totalQuestions);
  const grownCount = Math.min(Math.max(0, answeredCount), leafCount);

  useEffect(() => {
    if (answeredCount > prevAnsweredCountRef.current) {
      // A new leaf was answered during this live session.
      const newLeafIndex = Math.min(answeredCount, leafCount) - 1;
      if (newLeafIndex >= 0) {
        setAnimatedLeafIndex(newLeafIndex);
        scaleAnim.setValue(0);
        opacityAnim.setValue(0);
        Animated.parallel([
          Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start(() => setAnimatedLeafIndex(null));
      }
    }
    prevAnsweredCountRef.current = answeredCount;
  }, [answeredCount, leafCount, scaleAnim, opacityAnim]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0 && width !== canopyWidth) {
      setCanopyWidth(width);
    }
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Canopy area — leaves are absolutely positioned over this */}
      <View style={styles.canopyArea}>
        {/* Subtle canopy hint circle behind the leaves */}
        <View style={styles.canopyHint} />

        {/* Leaves */}
        {Array.from({ length: leafCount }).map((_, i) => {
          const pos = getLeafPosition(i, leafCount, canopyWidth);
          const isGrown = i < grownCount;
          const isAnimating = i === animatedLeafIndex;

          const leafStyle = [
            styles.leaf,
            { left: pos.x, top: pos.y, width: pos.size, height: pos.size },
            isGrown ? styles.leafGrown : styles.leafEmpty,
          ];

          return (
            <Animated.View
              key={i}
              style={[
                leafStyle,
                isAnimating && { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
              ]}
            />
          );
        })}
      </View>

      {/* Tree — trunk and branches drawn with plain Views */}
      <View style={styles.trunk} />
      <View style={[styles.branch, styles.branchLeft]} />
      <View style={[styles.branch, styles.branchRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  canopyArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CANOPY_HEIGHT,
  },
  canopyHint: {
    position: 'absolute',
    top: 5,
    left: 30,
    right: 30,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
  },
  trunk: {
    width: 16,
    height: 70,
    backgroundColor: '#92400E',
    borderRadius: 4,
  },
  branch: {
    position: 'absolute',
    width: 6,
    height: 40,
    backgroundColor: '#92400E',
    borderRadius: 3,
  },
  branchLeft: {
    bottom: 60,
    left: '42%',
    transform: [{ rotate: '-35deg' }],
  },
  branchRight: {
    bottom: 60,
    right: '42%',
    transform: [{ rotate: '35deg' }],
  },
  leaf: {
    position: 'absolute',
    borderRadius: 999,
  },
  leafGrown: {
    backgroundColor: '#22C55E',
    borderWidth: 1,
    borderColor: '#16A34A',
  },
  leafEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: lightColors.border,
  },
});