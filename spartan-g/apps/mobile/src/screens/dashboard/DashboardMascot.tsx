import { Animated, Image, StyleSheet } from 'react-native';

// Exact owner-approved source. Metro resolves this literal static require.
const approvedSpartan = require('../../../assets/chibi wave red spartan cartoon.png');
const aspectRatio = 5 / 6; // Original: 1145 x 1374, transparent RGBA PNG.

export function mascotSize(screenWidth: number, compact: boolean) {
  const height = Math.round(Math.min(compact ? 112 : 138, Math.max(92, screenWidth * (compact ? 0.30 : 0.33))));
  return { width: height * aspectRatio, height };
}

/** Whole-image entrance only: the PNG is not a layered character rig. */
export function DashboardMascot({ progress, screenWidth, compact, onLoad }: {
  progress: Animated.Value; screenWidth: number; compact: boolean; onLoad: () => void;
}) {
  return <Animated.View testID="dashboard-red-spartan" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.frame, mascotSize(screenWidth, compact), {
      opacity: progress.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0, 1, 1] }),
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 0.65, 0.83, 1], outputRange: [6, 0, -1.5, 0] }) }],
    }]}>
    <Image testID="dashboard-approved-mascot" source={approvedSpartan} resizeMode="contain" resizeMethod="resize" fadeDuration={0} onLoad={onLoad} accessible={false}
      style={compact ? { ...styles.image, top: screenWidth < 360 ? -8 : -10 } : styles.image} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  frame: { flexShrink: 0, alignSelf: 'center', backgroundColor: 'transparent' },
  // Keep the existing layout slot so the greeting and Journey never shift.
  // Render 10% larger around its horizontal center, with the crest 4 dp higher.
  // Lift compact layouts 8 dp (10 dp for wider, enlarged-text headers) to
  // clear the wrapped greeting throughout the existing entrance animation.
  // Explicit image dimensions let Android resize the source at its display size.
  image: { position: 'absolute', width: '110%', height: '110%', left: '-5%', top: -4, backgroundColor: 'transparent' },
});
