import { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
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

function HeroTree({ stage }: { stage: HeroStage }) {
  return (
    <View style={styles.treeBody}>
      <Svg width={150} height={205} viewBox="0 0 150 205" preserveAspectRatio="xMidYMid meet">
        {stage === 'sprout' && (
          <>
            <Path d="M22 188 Q32 175 48 180 Q58 166 75 178 Q91 165 103 180 Q119 174 128 188 Z" fill="#a9562b" stroke="#20371f" strokeWidth={2.5} strokeLinejoin="round" />
            <Path d="M52 181 Q70 168 70 130 Q70 111 57 96" fill="none" stroke="#7b481f" strokeWidth={6} strokeLinecap="round" />
            <Path d="M59 101 Q43 94 35 77 Q54 76 64 91 Q66 98 59 101 Z" fill="#82c94d" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M68 122 Q82 113 96 99 Q94 119 77 128 Q71 130 68 122 Z" fill="#a9dc63" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M40 82 Q51 87 61 96 M92 103 Q82 114 73 121" fill="none" stroke="#4d8f38" strokeWidth={1.5} strokeLinecap="round" />
          </>
        )}
        {stage === 'young' && (
          <>
            <Path d="M18 188 Q29 175 44 180 Q55 166 73 178 Q89 165 104 180 Q119 174 132 188 Z" fill="#a9562b" stroke="#20371f" strokeWidth={2.5} strokeLinejoin="round" />
            <Path d="M65 181 Q68 151 67 118 Q66 94 53 69 M67 128 Q51 116 37 101 M67 111 Q82 97 102 78" fill="none" stroke="#7b481f" strokeWidth={4} strokeLinecap="round" />
            <Path d="M54 72 Q36 68 29 48 Q49 48 60 62 Q61 69 54 72 Z" fill="#82c94d" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M100 80 Q102 59 118 46 Q120 66 108 79 Q104 83 100 80 Z" fill="#a9dc63" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M38 103 Q22 98 19 84 Q35 83 47 94 Q48 100 38 103 Z" fill="#a9dc63" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M70 128 Q84 114 99 111 Q94 128 77 134 Q71 135 70 128 Z" fill="#4d8f38" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M32 52 Q43 57 55 67 M115 50 Q108 63 103 76 M23 88 Q34 92 43 99 M94 115 Q84 121 74 129" fill="none" stroke="#4d8f38" strokeWidth={1.5} strokeLinecap="round" />
          </>
        )}
        {stage === 'mature' && (
          <>
            <Path d="M13 188 Q25 174 43 180 Q54 165 75 178 Q94 164 108 180 Q124 174 137 188 Z" fill="#a9562b" stroke="#20371f" strokeWidth={2.5} strokeLinejoin="round" />
            <Path d="M65 181 Q73 148 73 110 L73 63 M73 112 Q51 96 31 77 M73 96 Q91 78 111 57 M73 78 Q61 59 51 42 M73 69 Q86 53 98 39" fill="none" stroke="#e0d987" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M31 78 Q17 70 17 51 Q36 54 45 68 Q45 75 31 78 Z" fill="#4d8f38" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M111 58 Q116 39 133 34 Q133 54 119 62 Q114 64 111 58 Z" fill="#82c94d" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M51 43 Q38 34 42 17 Q58 24 61 38 Q59 43 51 43 Z" fill="#82c94d" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M98 40 Q100 21 116 13 Q118 32 105 42 Q101 44 98 40 Z" fill="#a9dc63" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M73 65 Q65 48 73 32 Q83 47 79 61 Q77 66 73 65 Z" fill="#82c94d" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M21 54 Q31 61 40 70 M129 38 Q120 48 114 56 M46 22 Q51 31 55 39 M114 19 Q108 29 102 38 M74 36 Q76 48 75 59" fill="none" stroke="#4d8f38" strokeWidth={1.5} strokeLinecap="round" />
          </>
        )}
        {stage === 'flourishing' && (
          <>
            <Path d="M10 188 Q22 174 40 180 Q52 164 72 178 Q91 164 108 180 Q126 174 140 188 Z" fill="#a9562b" stroke="#20371f" strokeWidth={2.5} strokeLinejoin="round" />
            <Path d="M67 181 Q74 151 74 117 L74 91 M74 128 Q48 108 26 88 M74 122 Q101 103 126 82 M74 103 Q56 82 43 58 M74 101 Q91 79 108 55" fill="none" stroke="#7b481f" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={43} cy={63} r={25} fill="#4d8f38" stroke="#20371f" strokeWidth={2.5} />
            <Circle cx={73} cy={49} r={29} fill="#82c94d" stroke="#20371f" strokeWidth={2.5} />
            <Circle cx={107} cy={59} r={24} fill="#4d8f38" stroke="#20371f" strokeWidth={2.5} />
            <Circle cx={27} cy={88} r={20} fill="#82c94d" stroke="#20371f" strokeWidth={2.5} />
            <Circle cx={51} cy={91} r={24} fill="#a9dc63" stroke="#20371f" strokeWidth={2.5} />
            <Circle cx={94} cy={89} r={24} fill="#a9dc63" stroke="#20371f" strokeWidth={2.5} />
            <Circle cx={123} cy={83} r={20} fill="#82c94d" stroke="#20371f" strokeWidth={2.5} />
            <Circle cx={74} cy={79} r={30} fill="#82c94d" stroke="#20371f" strokeWidth={2.5} />
            <Path d="M45 52 Q56 59 65 66 M73 24 Q73 39 73 53 M106 47 Q96 58 88 67 M28 82 Q40 85 49 89 M122 77 Q111 82 101 88" fill="none" stroke="#4d8f38" strokeWidth={2} strokeLinecap="round" />
            <Path d="M58 47 Q64 41 70 39 M83 70 Q89 64 95 62 M105 94 Q113 93 118 89" fill="none" stroke="#a9dc63" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
          </>
        )}
      </Svg>
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