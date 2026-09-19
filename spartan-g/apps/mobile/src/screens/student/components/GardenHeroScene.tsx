import { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { palette } from '@spartan-g/shared-ui';

// ─── Garden hero scene (v1) ───────────────────────────────────────────────
// A drawn "Level N tree" scene using the same plain-View/StyleSheet technique
// as ForestTree.tsx — trunk + canopy + flat scenery shapes. No image assets,
// no new dependencies. Watering only feeds XP into the existing level system;
// the tree's visual fullness is determined purely by `level` below.
//
//   stage: sprout(1-2) → young(3-4) → mature(5-6) → flourishing(7+)

interface GardenHeroSceneProps {
  level: number;
  /** Called when the watering can is tapped (after the tap animation starts). */
  onWaterPress: () => void;
  accessibilityLabel?: string;
}

type HeroStage = 'sprout' | 'young' | 'mature' | 'flourishing';

function stageFromLevel(level: number): HeroStage {
  if (level <= 2) return 'sprout';
  if (level <= 4) return 'young';
  if (level <= 6) return 'mature';
  return 'flourishing';
}

interface StageConfig {
  trunkH: number;
  trunkW: number;
  canopyW: number;
  canopyH: number;
  puffs: number; // extra canopy puffs for fullness
}

function stageConfig(stage: HeroStage): StageConfig {
  switch (stage) {
    case 'young':
      return { trunkH: 46, trunkW: 12, canopyW: 82, canopyH: 74, puffs: 1 };
    case 'mature':
      return { trunkH: 56, trunkW: 13, canopyW: 98, canopyH: 86, puffs: 2 };
    case 'flourishing':
      return { trunkH: 64, trunkW: 14, canopyW: 112, canopyH: 98, puffs: 3 };
    case 'sprout':
    default:
      return { trunkH: 34, trunkW: 10, canopyW: 64, canopyH: 60, puffs: 0 };
  }
}

function abs(
  width: number,
  height: number,
  color: string,
  left: number,
  top: number,
  radius: number = Math.min(width, height) / 2,
): ViewStyle {
  return {
    position: 'absolute',
    width,
    height,
    borderRadius: radius,
    backgroundColor: color,
    left,
    top,
  };
}

// Palette constants for the hero tree (green, neutral).
const TREE = {
  trunk: '#78350F',
  canopy: '#22C55E',
  puff: '#4ADE80',
  highlight: '#BBF7D0',
};

function HeroTree({ stage }: { stage: HeroStage }) {
  const cfg = stageConfig(stage);
  const puffSpots = [
    { left: 10, top: 6, s: 0.5 },
    { left: 40, top: 0, s: 0.55 },
    { left: -6, top: 34, s: 0.4 },
  ];

  return (
    <View style={styles.treeBody}>
      <View style={{ width: cfg.canopyW, height: cfg.canopyH }}>
        <View style={abs(cfg.canopyW, cfg.canopyH, TREE.canopy, 0, 0)} />
        {/* extra fullness puffs for higher stages */}
        {puffSpots.slice(0, cfg.puffs).map((p, i) => (
          <View
            key={i}
            style={abs(
              cfg.canopyW * p.s,
              cfg.canopyH * p.s * 0.9,
              i === 0 ? TREE.puff : TREE.highlight,
              p.left,
              p.top,
            )}
          />
        ))}
        <View style={abs(22, 22, TREE.highlight, cfg.canopyW * 0.28, cfg.canopyH * 0.12, 11)} />
      </View>
      <View
        style={{
          width: cfg.trunkW,
          height: cfg.trunkH,
          backgroundColor: TREE.trunk,
          borderRadius: 4,
        }}
      />
    </View>
  );
}
export function GardenHeroScene({ level, onWaterPress, accessibilityLabel }: GardenHeroSceneProps) {
  const stage = stageFromLevel(level);

  // Watering can tilt animation (degrees).
  const canTilt = useRef(new Animated.Value(0)).current;
  // Droplet opacity + downward travel.
  const dropletOpacity = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const dropletTravel = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const playWatering = () => {
    // Tip the can, then release as droplets fall and fade near the tree.
    Animated.sequence([
      Animated.timing(canTilt, { toValue: 1, duration: 230, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(canTilt, { toValue: 0, duration: 250, useNativeDriver: true }),
        ...dropletOpacity.map((o, i) =>
          Animated.timing(o, {
            toValue: 1,
            duration: 90,
            delay: i * 70,
            useNativeDriver: true,
          }),
        ),
        ...dropletTravel.map((t, i) =>
          Animated.spring(t, { toValue: 1, friction: 5, delay: i * 70, useNativeDriver: true }),
        ),
      ]),
      Animated.parallel(
        dropletOpacity.map((o, i) =>
          Animated.timing(o, {
            toValue: 0,
            duration: 380,
            delay: 60 + i * 70,
            useNativeDriver: true,
          }),
        ),
      ),
      Animated.parallel(
        dropletTravel.map((t) =>
          Animated.timing(t, { toValue: 0, duration: 10, useNativeDriver: true }),
        ),
      ),
    ]).start();
  };

  const handlePress = () => {
    playWatering();
    onWaterPress();
  };

  const tilt = canTilt.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-22deg'] });
  const dropTranslateY = dropletTravel[0].interpolate({
    inputRange: [0, 1],
    outputRange: [0, 30],
  });
  const dropTranslateY2 = dropletTravel[1].interpolate({
    inputRange: [0, 1],
    outputRange: [0, 34],
  });
  const dropTranslateY3 = dropletTravel[2].interpolate({
    inputRange: [0, 1],
    outputRange: [0, 38],
  });

  return (
    <View style={styles.scene}>
      {/* Tree + scenery */}
      <View style={styles.sceneInner}>
        <HeroTree stage={stage} />

        {/* Rocks (flat geometric) */}
        <View style={[styles.rock, styles.rock1]} />
        <View style={[styles.rock, styles.rock2]} />
        <View style={[styles.rock, styles.rock3]} />

        {/* Watering can (tappable) + falling droplets */}
        <View style={styles.canArea}>
          <Animated.View
            style={[
              styles.droplet,
              styles.drop1,
              { opacity: dropletOpacity[0], transform: [{ translateY: dropTranslateY }] },
            ]}
          />
          <Animated.View
            style={[
              styles.droplet,
              styles.drop2,
              { opacity: dropletOpacity[1], transform: [{ translateY: dropTranslateY2 }] },
            ]}
          />
          <Animated.View
            style={[
              styles.droplet,
              styles.drop3,
              { opacity: dropletOpacity[2], transform: [{ translateY: dropTranslateY3 }] },
            ]}
          />

          <TouchableOpacity
            style={styles.canHitbox}
            onPress={handlePress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? 'Water your tree'}
          >
            <Animated.View style={[styles.canGroup, { transform: [{ rotate: tilt }] }]}>
              <View style={styles.canHandle} />
              <View style={styles.canSpout} />
              <View style={styles.canBody} />
              <View style={styles.canLid} />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Ground patch */}
      <View style={styles.ground} />
    </View>
  );
}
const styles = StyleSheet.create({
  scene: {
    width: '100%',
    height: 205,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: palette.green100,
  },
  sceneInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  treeBody: {
    alignItems: 'center',
  },
  ground: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: '#86EFAC',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  rock: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: palette.slate300,
  },
  rock1: {
    width: 20,
    height: 16,
    left: 8,
    bottom: 22,
  },
  rock2: {
    width: 14,
    height: 12,
    left: 34,
    bottom: 24,
    backgroundColor: palette.slate400,
  },
  rock3: {
    width: 12,
    height: 10,
    left: 72,
    bottom: 22,
    backgroundColor: palette.slate300,
  },
  canArea: {
    position: 'absolute',
    right: 6,
    bottom: 18,
    width: 84,
    height: 80,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  canHitbox: {
    width: 70,
    height: 64,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  canGroup: {
    width: 70,
    height: 64,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  canBody: {
    width: 40,
    height: 30,
    borderRadius: 7,
    backgroundColor: palette.info,
  },
  canLid: {
    width: 30,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.indigo700,
    marginBottom: 2,
  },
  canSpout: {
    position: 'absolute',
    top: 8,
    left: 44,
    width: 26,
    height: 9,
    borderRadius: 5,
    backgroundColor: palette.info,
    transform: [{ rotate: '12deg' }],
  },
  canHandle: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 16,
    height: 16,
    borderWidth: 3,
    borderColor: palette.indigo700,
    borderBottomColor: 'transparent',
    borderRadius: 9,
  },
  droplet: {
    position: 'absolute',
    width: 7,
    height: 9,
    borderRadius: 4,
    backgroundColor: '#38BDF8',
  },
  drop1: { right: 40, bottom: 26 },
  drop2: { right: 34, bottom: 20 },
  drop3: { right: 27, bottom: 29 },
});