import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { forestColors } from '@spartan-g/shared-ui';
import { SHOW_FOREST_DEBUG, SPECIES_LABEL, TILE_H, TILE_W, treeVariant, type TreeVariant } from './forestLayout';
import { formatShortDate, type ForestCheckIn, type ForestSpecies } from './forestUtils';

// ─── ForestTree (isometric redesign) ───────────────────────────────────────
// One tree per check-in, drawn entirely from plain Views (same SVG-free
// technique as GardenTree / GardenHeroScene). Species, size, colours, mirroring
// and sway phase all come from forestLayout.treeVariant(), which is seeded by
// the check-in id — so a check-in always grows exactly the same tree.
//
// Animation: every tree reads ONE shared `wind` Animated.Value (a single native
// loop owned by ForestIsland) and phase-shifts it, so a 50-tree forest still
// costs just one running animation and zero JS-thread work per frame.

interface ForestTreeProps {
  checkIn: ForestCheckIn;
  /** Shared 0→1 wind cycle. Trees phase-shift it, never drive it. */
  wind: Animated.Value;
  /** Play the sapling→full-tree growth animation (new check-ins only). */
  animateIn?: boolean;
  /**
   * When true the tree belongs to another period: it stays in place (stable
   * layout) but fades back so the selected period reads clearly.
   */
  dimmed?: boolean;
  /** When true, idle sway + grow animations are skipped (accessibility). */
  reducedMotion: boolean;
  onPress: (checkIn: ForestCheckIn) => void;
  /** Tile centre inside the island (design px). */
  x: number;
  y: number;
  /** Debug-visible grid coordinate assigned by ForestIsland. */
  row: number;
  col: number;
  /**
   * When set, the tree renders in-flow (no absolute tile positioning) and is
   * scaled to fit inside `previewHeight` dp — used for the detail-sheet
   * thumbnail, where the island-tile hit box would overflow its small frame.
   */
  previewHeight?: number;
}

const SAMPLE_POINTS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

/** Piecewise-linear sine approximation of the shared wind value, in degrees. */
function swayDegrees(wind: Animated.Value, phase: number, amplitude: number) {
  return wind.interpolate({
    inputRange: SAMPLE_POINTS,
    outputRange: SAMPLE_POINTS.map((t) => `${(Math.sin((t + phase) * Math.PI * 2) * amplitude).toFixed(2)}deg`),
    extrapolate: 'clamp',
  });
}

/** Same wave, in pixels — reads as a breeze without rotating the trunk. */
function swayPixels(wind: Animated.Value, phase: number, amplitude: number) {
  return wind.interpolate({
    inputRange: SAMPLE_POINTS,
    outputRange: SAMPLE_POINTS.map((t) => Math.sin((t + phase) * Math.PI * 2) * amplitude),
    extrapolate: 'clamp',
  });
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

function Triangle({
  w,
  h,
  color,
  style,
}: {
  w: number;
  h: number;
  color: string;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          width: 0,
          height: 0,
          borderLeftWidth: w / 2,
          borderRightWidth: w / 2,
          borderBottomWidth: h,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        },
        style,
      ]}
    />
  );
}

function Star({ left, top, size, color }: { left: number; top: number; size: number; color: string }) {
  return (
    <View style={{ position: 'absolute', left, top, width: size, height: size }}>
      <View style={abs(size * 0.28, size, color, size * 0.36, 0, size * 0.14)} />
      <View style={abs(size, size * 0.28, color, 0, size * 0.36, size * 0.14)} />
    </View>
  );
}

// ─── Species geometry ──────────────────────────────────────────────────────
interface ShapeProps {
  h: number;
  w: number;
  v: TreeVariant;
}

/** Tall conifer: three stacked triangles over a short trunk. */
function PineTree({ h, w, v }: ShapeProps) {
  const trunkH = h * 0.2;
  const trunkW = Math.max(3, w * 0.13);
  const tiers = [
    { base: w, height: h * 0.46, bottom: trunkH * 0.6, color: v.canopyDark },
    { base: w * 0.78, height: h * 0.4, bottom: trunkH * 0.6 + h * 0.3, color: v.canopy },
    { base: w * 0.52, height: h * 0.34, bottom: trunkH * 0.6 + h * 0.58, color: v.canopy },
  ];
  return (
    <View style={{ width: w, height: h, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View style={abs(trunkW, trunkH, v.trunk, (w - trunkW) / 2, h - trunkH, trunkW / 3)} />
      {tiers.map((tier, i) => (
        <Triangle
          key={i}
          w={tier.base}
          h={tier.height}
          color={tier.color}
          style={{ position: 'absolute', bottom: tier.bottom, left: (w - tier.base) / 2 }}
        />
      ))}
      <View style={abs(w * 0.16, w * 0.16, v.accent, w * 0.42, h * 0.02, w * 0.08)} />
    </View>
  );
}

/** Round flowering bush: overlapping blobs + petals. */
function Bush({ h, w, v }: ShapeProps) {
  const blob = h * 0.62;
  const crest = h - blob * 0.82;
  const flowers = [
    { left: 0.18, top: 0.3, size: 0.12 },
    { left: 0.62, top: 0.18, size: 0.14 },
    { left: 0.42, top: 0.03, size: 0.1 },
    { left: 0.78, top: 0.48, size: 0.1 },
  ];
  return (
    <View style={{ width: w, height: h, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View style={abs(blob, blob * 0.92, v.canopyDark, (w - blob) / 2, crest, blob / 2)} />
      <View
        style={abs(
          blob * 0.72,
          blob * 0.68,
          v.canopy,
          (w - blob) / 2 - blob * 0.18,
          crest + blob * 0.1,
          blob * 0.36,
        )}
      />
      <View
        style={abs(
          blob * 0.58,
          blob * 0.56,
          v.canopy,
          (w - blob) / 2 + blob * 0.26,
          crest + blob * 0.24,
          blob * 0.29,
        )}
      />
      {flowers.map((p, i) => (
        <View
          key={i}
          style={abs(w * p.size, w * p.size, forestColors.text, w * p.left, crest + blob * p.top, (w * p.size) / 2)}
        />
      ))}
    </View>
  );
}
/** Tall flowering / coral-like plant: stem, leaf pairs and blooms. */
function BloomPlant({ h, w, v }: ShapeProps) {
  const stemW = Math.max(2, w * 0.08);
  const leafW = w * 0.4;
  const leafH = h * 0.13;
  const bloom = Math.max(6, w * 0.22);
  const blooms = [
    { top: 0.04, left: 0.5, size: 1, color: v.accent },
    { top: 0.22, left: 0.2, size: 0.8, color: forestColors.bloomPurple },
    { top: 0.34, left: 0.78, size: 0.72, color: v.accent },
    { top: 0.48, left: 0.28, size: 0.62, color: forestColors.bloomPurple },
  ];
  return (
    <View style={{ width: w, height: h, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View style={abs(stemW, h * 0.88, v.trunk, (w - stemW) / 2, h - h * 0.88, stemW / 2)} />
      {[0.42, 0.6].map((top, i) => (
        <View key={i} style={{ position: 'absolute', left: i === 0 ? 0 : w * 0.6, top: h * top }}>
          <View
            style={[
              abs(leafW, leafH, v.canopyDark, 0, 0, leafH / 2),
              { transform: [{ rotate: i === 0 ? '-26deg' : '26deg' }] },
            ]}
          />
        </View>
      ))}
      {blooms.map((b, i) => (
        <View
          key={i}
          style={abs(
            bloom * b.size,
            bloom * b.size,
            b.color,
            w * b.left - (bloom * b.size) / 2,
            h * b.top,
            (bloom * b.size) / 2,
          )}
        />
      ))}
      <View style={abs(w * 0.62, h * 0.16, forestColors.bloomPink, w * 0.18, h * 0.76, h * 0.08)} />
      <View style={abs(w * 0.38, h * 0.13, forestColors.bloomPink, w * 0.5, h * 0.7, h * 0.06)} />
      {[{ left: 0.06, top: 0.12 }, { left: 0.78, top: 0.08 }, { left: 0.68, top: 0.48 }, { left: 0.08, top: 0.54 }].map(
        (star, i) => (
          <Star key={i} left={w * star.left} top={h * star.top} size={Math.max(4, w * 0.12)} color={forestColors.flower} />
        ),
      )}
    </View>
  );
}

/** Withered tree: bare trunk with angular branches (streak break). */
function WitheredTree({ h, w, v }: ShapeProps) {
  const trunkW = Math.max(3, w * 0.14);
  const branches = [
    { left: 0.08, top: 0.28, rotate: '-36deg', length: w * 0.5 },
    { left: 0.52, top: 0.16, rotate: '32deg', length: w * 0.46 },
    { left: 0.24, top: 0.48, rotate: '-22deg', length: w * 0.34 },
    { left: 0.46, top: 0.38, rotate: '18deg', length: w * 0.3 },
  ];
  return (
    <View style={{ width: w, height: h, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View style={abs(trunkW, h * 0.94, v.trunk, (w - trunkW) / 2, h - h * 0.94, trunkW / 3)} />
      {branches.map((b, i) => (
        <View
          key={i}
          style={[
            abs(b.length, Math.max(2, trunkW * 0.5), v.canopyDark, w * b.left, h * b.top, trunkW * 0.25),
            { transform: [{ rotate: b.rotate }] },
          ]}
        />
      ))}
    </View>
  );
}

/** Milestone tree: golden conifer with sparkles. */
function GoldenShape({ h, w, v }: ShapeProps) {
  const trunkH = h * 0.18;
  const trunkW = Math.max(3, w * 0.12);
  const sparkles = [
    { left: 0.1, top: 0.08 },
    { left: 0.78, top: 0.2 },
    { left: 0.22, top: 0.44 },
    { left: 0.66, top: 0.58 },
  ];
  return (
    <View style={{ width: w, height: h, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View style={abs(trunkW, trunkH, v.trunk, (w - trunkW) / 2, h - trunkH, trunkW / 3)} />
      <Triangle
        w={w}
        h={h * 0.36}
        color={v.canopyDark}
        style={{ position: 'absolute', bottom: h - trunkH - h * 0.3, left: 0 }}
      />
      <Triangle
        w={w * 0.76}
        h={h * 0.32}
        color={v.canopy}
        style={{ position: 'absolute', bottom: h - trunkH - h * 0.56, left: w * 0.12 }}
      />
      <View style={abs(w * 0.3, w * 0.3, v.canopy, w * 0.35, h - trunkH - h * 0.84, w * 0.15)} />
      {sparkles.map((s, i) => (
        <View key={i} style={abs(w * 0.09, w * 0.09, v.sparkle ?? v.accent, w * s.left, h * s.top, w * 0.045)} />
      ))}
    </View>
  );
}

/** Empty-state sapling. */
function SaplingShape({ h, w, v }: ShapeProps) {
  const trunkW = Math.max(2, w * 0.12);
  const leafW = w * 0.44;
  return (
    <View style={{ width: w, height: h, justifyContent: 'flex-end', alignItems: 'center' }}>
      <View style={abs(trunkW, h * 0.82, v.trunk, (w - trunkW) / 2, h - h * 0.82, trunkW / 2)} />
      <View
        style={[
          abs(leafW, h * 0.2, v.canopy, (w - leafW) / 2, h * 0.1, h * 0.1),
          { transform: [{ rotate: '-22deg' }] },
        ]}
      />
      <View
        style={[
          abs(leafW, h * 0.2, v.canopyDark, (w - leafW) / 2, h * 0.28, h * 0.1),
          { transform: [{ rotate: '20deg' }] },
        ]}
      />
    </View>
  );
}

// ─── Species switch ────────────────────────────────────────────────────────
function TreeShape({ species, h, w, v }: ShapeProps & { species: ForestSpecies }) {
  switch (species) {
    case 'pine':
      return <PineTree h={h} w={w} v={v} />;
    case 'bush':
      return <Bush h={h} w={w} v={v} />;
    case 'bloom':
      return <BloomPlant h={h} w={w} v={v} />;
    case 'bare':
      return <WitheredTree h={h} w={w} v={v} />;
    case 'golden':
      return <GoldenShape h={h} w={w} v={v} />;
    case 'sapling':
    default:
      return <SaplingShape h={h} w={w} v={v} />;
  }
}

function ForestTreeComponent({
  checkIn,
  wind,
  animateIn = false,
  dimmed = false,
  reducedMotion,
  onPress,
  x,
  y,
  row,
  col,
  previewHeight,
}: ForestTreeProps) {
  const variant = useMemo(
    () => treeVariant(checkIn.attemptId, checkIn.species, checkIn.growRatio),
    [checkIn.attemptId, checkIn.species, checkIn.growRatio],
  );

  // Overall tree height, capped so even the widest canopy (golden ≈ 1.0 × H,
  // bloom ≈ 0.85 × H) stays within ~80% of a tile's width and canopies on
  // neighbouring tiles can't collide.
  const fullHeight = TILE_W * 0.62 * variant.size;
  // Thumbnail mode scales the whole tree down into its small frame.
  const previewScale =
    previewHeight !== undefined ? Math.min(1, previewHeight / fullHeight) : 1;
  const height = fullHeight * previewScale;
  const width = height * 0.66;

  // Idle sway: canopy drifts and tilts while the trunk stays planted.
  const swayRotation = useMemo(
    () => (reducedMotion ? null : swayDegrees(wind, variant.swayPhase, 2.2 * variant.swayAmp)),
    [reducedMotion, wind, variant.swayPhase, variant.swayAmp],
  );
  const swayShift = useMemo(
    () => (reducedMotion ? null : swayPixels(wind, variant.swayPhase, 2.4 * variant.swayAmp)),
    [reducedMotion, wind, variant.swayPhase, variant.swayAmp],
  );

  // Grow-in: sapling → full tree, played once for freshly added check-ins.
  const grow = useRef(new Animated.Value(animateIn && !reducedMotion ? 0 : 1)).current;
  useEffect(() => {
    if (!animateIn || reducedMotion) {
      grow.setValue(1);
      return;
    }
    grow.setValue(0);
    Animated.spring(grow, {
      toValue: 1,
      friction: 6,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [animateIn, reducedMotion, grow]);

  const enterStyle = {
    opacity: grow.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.9, 1] }),
    transform: [
      // Mirroring is folded in here: a later `transform` in a style array
      // replaces the earlier one outright, so both must share one array.
      { scaleX: variant.mirror ? -1 : 1 },
      { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
      { translateY: grow.interpolate({ inputRange: [0, 1], outputRange: [TILE_H * 0.5, 0] }) },
    ],
  };

  const label = `${SPECIES_LABEL[checkIn.species]}, check-in on ${formatShortDate(checkIn.date)}`;
  // Feet sit slightly below the tile centre so the tree reads as standing in it.
  const feetY = y + TILE_H * 0.2;

  // Detail-sheet thumbnail: in-flow layout, no tile offsets, sized to fit the
  // frame so nothing overflows the sheet header.
  if (previewHeight !== undefined) {
    return (
      <View
        style={[styles.preview, { height: previewHeight, width: TILE_W * previewScale }]}
        accessible
        accessibilityLabel={label}
      >
        <TreeShape species={checkIn.species} h={height} w={width} v={variant} />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(checkIn)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the check-in details"
      style={[
        styles.hit,
        {
          left: x - TILE_W / 2,
          top: feetY - height,
          width: TILE_W,
          height: height + TILE_H * 0.6,
          opacity: dimmed ? 0.42 : 1,
        },
      ]}
    >
      <View style={styles.groundShadow} />
      {__DEV__ && SHOW_FOREST_DEBUG && (
        <View pointerEvents="none" style={styles.debugMarker}>
          <View style={styles.debugDot} />
          <Text style={styles.debugLabel}>{`${col},${row}`}</Text>
        </View>
      )}
      <Animated.View style={[styles.body, enterStyle]}>
        <Animated.View style={swayShift ? { transform: [{ translateX: swayShift }] } : undefined}>
          <Animated.View style={swayRotation ? { transform: [{ rotate: swayRotation }] } : undefined}>
            <TreeShape species={checkIn.species} h={height} w={width} v={variant} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** Memoised so a forest re-render never repaints unchanged trees. */
export const ForestTree = memo(ForestTreeComponent);

const styles = StyleSheet.create({
  hit: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  preview: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  body: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  groundShadow: {
    position: 'absolute',
    bottom: 2,
    width: TILE_W * 0.34,
    height: TILE_H * 0.22,
    borderRadius: TILE_H,
    backgroundColor: '#163D2B',
    opacity: 0.35,
  },
  debugMarker: {
    position: 'absolute',
    bottom: TILE_H * 0.08,
    alignItems: 'center',
    zIndex: 20,
  },
  debugDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF4D6D',
  },
  debugLabel: {
    color: '#FFFFFF',
    backgroundColor: '#7A1834',
    fontSize: 9,
    lineHeight: 12,
    paddingHorizontal: 2,
  },
});

