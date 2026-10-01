import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { lightColors } from '@spartan-g/shared-ui';

interface GardenTreeProps {
  totalQuestions: number;
  answeredCount: number;
  containerHeight?: number;
}

// ─── Garden assessment tree (lobed-canopy redesign) ─────────────────────────
// Fixed scaffold (soil + trunk + 5 tapered branches) rendered once, plus a
// lobed canopy that grows smoothly with answered/total progress. The canopy
// uses the approved lobed visual language: fused leaf-green backing lobes form
// one continuous silhouette, 2-tone highlight/shadow lobes add dimension, and
// on-top anchor blobs sit at the 7 verified points. Each element fades in and
// scales up over its own progress window, so the tree interpolates
// continuously between bare (0%) and full canopy (100%).

// Palette — matches garden-assessment-tree-preview.html
const SOIL = '#a9562b';
const TRUNK = '#9b5b28';
const TRUNK_DARK = '#613519';
const BRANCH = '#78421f';
const BRANCH_OUTLINE = '#4b2818';
const LEAF = '#79c943';
const LEAF_DARK = '#438b36';
const LEAF_LIGHT = '#a6da5d';

// SVG canvas — same viewBox as the approved preview (240 x 100).
const VIEW_W = 240;
const VIEW_H = 100;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smoothstep = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Where a canopy element appears over progress: 0 → invisible, 1 → full. */
const ease = (progress: number, start: number, end: number) =>
  end > start ? smoothstep((progress - start) / (end - start)) : 0;

interface EllipseEl {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  s: number;
  e: number;
}
interface AnchorEl {
  id: string;
  cx: number;
  cy: number;
  s: number;
  e: number;
}

// Backing lobes fused into the continuous leaf silhouette (draw order).
const BACKING: EllipseEl[] = [
  { id: 'backing-left-crown', cx: 96, cy: 42, rx: 36, ry: 30, s: 0.12, e: 0.35 },
  { id: 'backing-right-crown', cx: 146, cy: 42, rx: 36, ry: 30, s: 0.12, e: 0.35 },
  { id: 'backing-upper-left', cx: 107, cy: 22, rx: 28, ry: 22, s: 0.3, e: 0.5 },
  { id: 'backing-upper-right', cx: 135, cy: 22, rx: 28, ry: 22, s: 0.3, e: 0.5 },
  { id: 'backing-lower-left', cx: 112, cy: 58, rx: 20, ry: 22, s: 0.38, e: 0.58 },
  { id: 'backing-lower-right', cx: 130, cy: 58, rx: 20, ry: 22, s: 0.38, e: 0.58 },
  { id: 'backing-top', cx: 121, cy: 15, rx: 26, ry: 20, s: 0.5, e: 0.7 },
  { id: 'backing-trunk-wrap', cx: 121, cy: 62, rx: 22, ry: 24, s: 0.58, e: 0.8 },
];

// Underside shadow lobes (darker for volume).
const SHADOWS: EllipseEl[] = [
  { id: 'shadow-lower-right', cx: 150, cy: 50, rx: 16, ry: 14, s: 0.45, e: 0.65 },
  { id: 'shadow-right-edge', cx: 165, cy: 45, rx: 12, ry: 12, s: 0.55, e: 0.75 },
];

// Upper-left highlight lobes (lighter — light source).
const HIGHLIGHTS: EllipseEl[] = [
  { id: 'highlight-upper-left', cx: 102, cy: 26, rx: 14, ry: 12, s: 0.35, e: 0.55 },
  { id: 'highlight-left-edge', cx: 89, cy: 34, rx: 12, ry: 11, s: 0.5, e: 0.7 },
  { id: 'highlight-top', cx: 112, cy: 14, rx: 11, ry: 10, s: 0.6, e: 0.8 },
];

// The 7 verified anchor points — one per branch tip / trunk flank.
const ANCHORS: AnchorEl[] = [
  { id: 'anchor-B1', cx: 78, cy: 44, s: 0.1, e: 0.28 },
  { id: 'anchor-B2', cx: 172, cy: 40, s: 0.15, e: 0.33 },
  { id: 'anchor-B3', cx: 94, cy: 23, s: 0.28, e: 0.42 },
  { id: 'anchor-B4', cx: 152, cy: 22, s: 0.33, e: 0.47 },
  { id: 'anchor-B5', cx: 122, cy: 13, s: 0.45, e: 0.6 },
  { id: 'anchor-C6', cx: 114.6, cy: 58, s: 0.5, e: 0.66 },
  { id: 'anchor-C7', cx: 125.4, cy: 58, s: 0.5, e: 0.66 },
];
export function GardenTree({ totalQuestions, answeredCount, containerHeight = 200 }: GardenTreeProps) {
  const progress = totalQuestions > 0 ? clamp01(answeredCount / totalQuestions) : 0;

  // Animated values for the canopy growth "pop-in". Rest at 1/1 when idle.
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  // Initialized to CURRENT answeredCount on mount so restored/loaded progress
  // renders already-grown with no animation; only a live increase pops-in.
  const prevAnsweredCountRef = useRef(answeredCount);

  useEffect(() => {
    if (answeredCount > prevAnsweredCountRef.current) {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0.6);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
    }
    prevAnsweredCountRef.current = answeredCount;
  }, [answeredCount, scaleAnim, opacityAnim]);

  // Each element grows from 60% → 100% size while fading in over its window.
  const renderEllipse = (el: EllipseEl, fill: string) => {
    const a = ease(progress, el.s, el.e);
    if (a <= 0.001) return null;
    const s = 0.6 + 0.4 * a;
    return <Ellipse key={el.id} cx={el.cx} cy={el.cy} rx={el.rx * s} ry={el.ry * s} fill={fill} opacity={a} />;
  };

  return (
    <View style={[styles.container, { height: containerHeight }]}>
      <View style={styles.stage} pointerEvents="none">
        {/* Static scaffold — soil + trunk + 5 tapered branches (always visible). */}
        <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
          <Path d="M104 94 Q120 89 136 94 Z" fill={SOIL} stroke={TRUNK_DARK} strokeWidth={1.5} />
          <Path
            d="M108 94 Q114 76 115 51 Q116 32 120 14 Q124 32 125 51 Q126 76 132 94 Z"
            fill={TRUNK}
            stroke={TRUNK_DARK}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <Path
            d="M116 73 C101 69 88 58 76 46 L80 43 C94 54 106 62 120 66 Z"
            fill={BRANCH}
            stroke={BRANCH_OUTLINE}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <Path
            d="M124 67 C140 62 154 50 170 38 L174 42 C158 56 145 68 123 74 Z"
            fill={BRANCH}
            stroke={BRANCH_OUTLINE}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <Path
            d="M117 54 C106 46 99 36 92 24 L96 22 C103 34 111 43 121 48 Z"
            fill={BRANCH}
            stroke={BRANCH_OUTLINE}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <Path
            d="M123 49 C133 41 142 31 149 20 L153 23 C145 36 136 47 123 55 Z"
            fill={BRANCH}
            stroke={BRANCH_OUTLINE}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <Path
            d="M120 46 C118 35 119 24 120 13 L124 13 C124 26 125 36 125 48 Z"
            fill={BRANCH}
            stroke={BRANCH_OUTLINE}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <Path
            d="M119 91 Q120 66 120 43"
            fill="none"
            stroke={TRUNK_DARK}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </Svg>
      </View>

      {/* Growing lobed canopy on its own overlay so the scale/opacity pop-in
          animates the foliage without scaling the trunk/branches. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.stage, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
          {BACKING.map((el) => renderEllipse(el, LEAF))}
          {SHADOWS.map((el) => renderEllipse(el, LEAF_DARK))}
          {HIGHLIGHTS.map((el) => renderEllipse(el, LEAF_LIGHT))}
          {ANCHORS.map((el) => {
            const a = ease(progress, el.s, el.e);
            if (a <= 0.001) return null;
            return (
              <Circle key={el.id} cx={el.cx} cy={el.cy} r={7 * (0.6 + 0.4 * a)} fill={LEAF} opacity={a} />
            );
          })}
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    width: '100%',
    backgroundColor: '#f4fbf5',
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  stage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});