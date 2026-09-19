import { StyleSheet, View, type ViewStyle } from 'react-native';

// ─── Forest tree drawing (v1) ─────────────────────────────────────────────
// Pure placeholder trees made entirely with plain Views + StyleSheet, matching
// the SVG-free technique already used in GardenTree.tsx. No new assets, no new
// dependencies. Real artwork can be swapped in later WITHOUT changing any logic
// here — the species/size/palette contract stays identical.
//
// Appearance is driven ONLY by neutral attributes:
//   • species   — which instrument(s) an attempt contained (shape variant)
//   • growRatio — answered ÷ total questions (size, same ratio as leaf tree)
//   • palette   — calendar month the attempt was submitted (color)
// NO score, severity band, or risk value is ever read here.

export type ForestSpecies = 'phq' | 'gad' | 'dass' | 'combined' | 'sapling';

/** Neutral color palette — keyed only by submission month. */
export interface ForestPalette {
  trunk: string;
  canopy: string;
  accent: string;
}

interface ForestTreeProps {
  species: ForestSpecies;
  /** 0..1 — answered / total questions (reuses the leaf-tree ratio). */
  growRatio: number;
  palette: ForestPalette;
}

/** Size factor: 0% progress ≈ small sapling … 100% progress ≈ full tree. */
function sizeFactor(growRatio: number): number {
  const clamped = Math.min(Math.max(growRatio, 0), 1);
  return 0.72 + clamped * 0.6; // 0.72 … 1.32
}

// Tiny helper to build an absolutely-positioned soft shape.
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

// ─── Canopy variants (one base shape per instrument composition) ──────────
function RoundCanopy({ s, palette }: { s: number; palette: ForestPalette }) {
  // PHQ-* only — a round, friendly canopy.
  return (
    <View style={{ width: 88 * s, height: 82 * s }}>
      <View style={abs(84 * s, 80 * s, palette.canopy, 2 * s, 0)} />
      <View style={abs(20 * s, 20 * s, palette.accent, 24 * s, 14 * s, 10 * s)} />
    </View>
  );
}

function PineCanopy({ s, palette }: { s: number; palette: ForestPalette }) {
  // GAD-* only — a tall, pointed conifer built from two stacked triangles.
  const bottomBase = 56 * s;
  const topBase = 40 * s;
  return (
    <View style={{ width: 72 * s, height: 104 * s, position: 'relative' }}>
      <View
        style={{
          position: 'absolute',
          bottom: 4 * s,
          left: (72 * s - bottomBase) / 2,
          borderLeftWidth: bottomBase / 2,
          borderRightWidth: bottomBase / 2,
          borderBottomWidth: 64 * s,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: palette.canopy,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 34 * s,
          left: (72 * s - topBase) / 2,
          borderLeftWidth: topBase / 2,
          borderRightWidth: topBase / 2,
          borderBottomWidth: 52 * s,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: palette.accent,
        }}
      />
    </View>
  );
}

function CloudCanopy({ s, palette }: { s: number; palette: ForestPalette }) {
  // DASS-* only — a soft, puffy cloud of overlapping circles.
  return (
    <View style={{ width: 100 * s, height: 64 * s }}>
      <View style={abs(52 * s, 52 * s, palette.canopy, 0, 4 * s)} />
      <View style={abs(46 * s, 46 * s, palette.canopy, 32 * s, 0)} />
      <View style={abs(42 * s, 42 * s, palette.canopy, 58 * s, 4 * s)} />
      <View style={abs(18 * s, 18 * s, palette.accent, 14 * s, 12 * s, 9 * s)} />
    </View>
  );
}

function BroadCanopy({ s, palette }: { s: number; palette: ForestPalette }) {
  // Combined (multiple instruments) — a wide, spreading canopy.
  return (
    <View style={{ width: 120 * s, height: 70 * s }}>
      <View style={abs(96 * s, 58 * s, palette.canopy, 12 * s, 2 * s, 28 * s)} />
      <View style={abs(34 * s, 34 * s, palette.canopy, 0, 8 * s)} />
      <View style={abs(30 * s, 30 * s, palette.canopy, 88 * s, 10 * s)} />
      <View style={abs(16 * s, 16 * s, palette.accent, 44 * s, 10 * s, 8 * s)} />
    </View>
  );
}

function Sapling({ s, palette }: { s: number; palette: ForestPalette }) {
  // Empty-state graphic: a single bare sapling (trunk + one young canopy).
  return (
    <View style={{ width: 46 * s, height: 66 * s, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={abs(30 * s, 30 * s, palette.canopy, 8 * s, 4 * s, 15 * s)} />
      <View
        style={{
          position: 'absolute',
          top: 28 * s,
          width: 6 * s,
          height: 34 * s,
          backgroundColor: palette.trunk,
          borderRadius: 3 * s,
        }}
      />
    </View>
  );
}

export function ForestTree({ species, growRatio, palette }: ForestTreeProps) {
  const s = sizeFactor(growRatio);
  const trunkWidth = 13 * s;
  const trunkHeight = 42 * s;

  if (species === 'sapling') {
    return (
      <View style={styles.cell}>
        <View style={styles.treeBody}>
          <Sapling s={s} palette={palette} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cell}>
      <View style={styles.treeBody}>
        {species === 'gad' ? (
          <PineCanopy s={s} palette={palette} />
        ) : species === 'dass' ? (
          <CloudCanopy s={s} palette={palette} />
        ) : species === 'combined' ? (
          <BroadCanopy s={s} palette={palette} />
        ) : (
          <RoundCanopy s={s} palette={palette} />
        )}
        <View
          style={[
            styles.trunk,
            { width: trunkWidth, height: trunkHeight, backgroundColor: palette.trunk },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: 130,
    height: 185,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  treeBody: {
    alignItems: 'center',
  },
  trunk: {
    borderRadius: 4,
  },
});