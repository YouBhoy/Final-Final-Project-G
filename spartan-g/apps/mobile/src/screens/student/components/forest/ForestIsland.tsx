import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { forestColors } from '@spartan-g/shared-ui';
import { ForestTree } from './ForestTree';
import {
  TILE_H,
  TILE_W,
  WALL_DEPTH,
  islandMetrics,
  tileToScreen,
  tileShade,
  SHOW_FOREST_DEBUG,
} from './forestLayout';
import { rngFor, spiralTile, type ForestCheckIn } from './forestUtils';

// ─── ForestIsland ──────────────────────────────────────────────────────────
// The floating isometric island: a diamond of grass tiles over a two-tone soil
// platform, with one deterministic tree per check-in. Everything is layout
// Views (no image assets, no SVG dependency), so it scales crisply and paints
// only the tiles that actually exist.
//
// Paint order: shadow → soil faces → grass base → tiles → trees sorted
// back-to-front by grid depth so nearer trees overlap the ones behind.

const DIAMOND_TRANSFORM = [{ scaleY: 0.5 }, { rotate: '45deg' }];

/** A 2:1 isometric diamond of the given width, centred on (left, top). */
function diamond(
  size: number,
  color: string,
  left: number,
  top: number,
  key?: string,
  borderColor?: string,
) {
  // Round to the nearest even pixel so `side / 2` is a whole number. Combined
  // with an integer centre (see `cx`/`cy` below) this puts every diamond's
  // `left`/`top` on an integer pixel boundary — no subpixel AA seams.
  const side = Math.round(size / Math.SQRT2 / 2) * 2;
  return (
    <View
      key={key}
      style={{
        position: 'absolute',
        left: left - side / 2,
        top: top - side / 2,
        width: side,
        height: side,
        backgroundColor: color,
        borderWidth: borderColor ? 1 : 0,
        borderColor,
        transform: DIAMOND_TRANSFORM,
      }}
    />
  );
}

interface TileSpec {
  dr: number;
  dc: number;
  x: number;
  y: number;
  depth: number;
  shade: string;
}

function tileEdgeShade(shade: string): string {
  if (shade === forestColors.grassLight) return forestColors.grass;
  if (shade === forestColors.grassDark) return forestColors.grassLine;
  return forestColors.grassDark;
}

function TileFace({ tile }: { tile: TileSpec }) {
  const edge = tileEdgeShade(tile.shade);
  return (
    <>
      {/* Fixed whole-pixel seam: the edge diamond fills the full 68-wide
          tessellation cell so adjacent tiles share an exact edge (no background
          gap); the face is inset a fixed 4px (2px per side) so the darker grout
          line is identical on every tile — never a byproduct of unrounded math. */}
      {diamond(TILE_W, edge, tile.x, tile.y, `${tile.dr}:${tile.dc}:edge`)}
      {diamond(TILE_W - 4, tile.shade, tile.x, tile.y, `${tile.dr}:${tile.dc}:face`)}
      {SHOW_FOREST_DEBUG && (
        <View
          style={{
            position: 'absolute',
            left: tile.x - TILE_W * 0.22,
            top: tile.y - TILE_H * 0.28,
            width: TILE_W * 0.42,
            height: 1.5,
            backgroundColor: forestColors.grassLight,
            opacity: 0.34,
            transform: [{ rotate: '-26.565deg' }],
          }}
        />
      )}
      {SHOW_FOREST_DEBUG && (
        <View
          style={{
            position: 'absolute',
            left: tile.x + TILE_W * 0.01,
            top: tile.y + TILE_H * 0.27,
            width: TILE_W * 0.42,
            height: 1.5,
            backgroundColor: edge,
            opacity: 0.46,
            transform: [{ rotate: '-26.565deg' }],
          }}
        />
      )}
    </>
  );
}

export interface ForestIslandProps {
  /** Every check-in, oldest first, with its global 0-based index. */
  checkIns: ForestCheckIn[];
  /** Attempt id that should play the grow animation (newest check-in). */
  animateInAttemptId?: string | null;
  reducedMotion: boolean;
  onSelectTree: (checkIn: ForestCheckIn) => void;
  /** Width available for the island, in dp. */
  availableWidth: number;
  /** Height budget for the island, in dp — caps the fit scale. */
  availableHeight: number;
  /**
   * Reports the island's exact fitted height (canvasH × fitScale) so a parent
   * pinch viewport can size itself with no dead space or clipping.
   */
  onLayout?: (fittedHeight: number) => void;
}

function ForestIslandComponent({
  checkIns,
  animateInAttemptId,
  reducedMotion,
  onSelectTree,
  availableWidth,
  availableHeight,
  onLayout,
}: ForestIslandProps) {
  const count = checkIns.length;
  // Odd grid ≥ 5 so a centre tile always exists, growing by one ring per 8
  // trees that no longer fit — the island expands instead of overflowing.
  const metrics = useMemo(
    () => islandMetrics(count, availableWidth, availableHeight),
    [count, availableWidth, availableHeight],
  );
  const { grid, islandW, islandH, canvasW, canvasH, fitScale } = metrics;
  const half = (grid - 1) / 2;

  const cx = Math.round(canvasW / 2);
  const cy = Math.round(TILE_W * 0.95 + islandH / 2);
  // Each grass face is inset by 1dp, so the visible outer footprint is two dp
  // narrower than the mathematical grid width. The extrusion must use that
  // same visible boundary or it will peek past the left/right corners.
  const grassFootprintW = islandW - 2;

  // Shared 0→1 wind cycle: ONE native animation drives every tree's sway, so
  // the forest costs a single running loop no matter how many trees exist.
  const wind = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) {
      wind.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wind, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(wind, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, wind]);

  // Static tile layout — recomputed only when the grid changes.
  const tiles = useMemo<TileSpec[]>(() => {
    const list: TileSpec[] = [];
    for (let row = 0; row < grid; row++) {
      const dr = row - half;
      for (let column = 0; column < grid; column++) {
        const dc = column - half;
        const p = tileToScreen(dc, dr);
        list.push({ dr, dc, x: cx + p.x, y: cy + p.y, depth: dr + dc, shade: tileShade(dr, dc) });
      }
    }
    return list.sort((a, b) => a.depth - b.depth || a.dc - b.dc);
  }, [half, cx, cy]);

  // Soil speckles give the exposed dirt band some texture (deterministic).
  const speckles = useMemo(() => {
    const rand = rngFor(`island:${grid}`);
    return Array.from({ length: grid }, () => ({
      drift: rand() * 0.55 + 0.22,
      depth: rand(),
      size: 3 + rand() * 3,
    }));
  }, [grid]);

  // The soil footprint uses the same grid width, height, origin and projection
  // as the grass. It is one continuous base; only its outer edge gets roots.
  const soilRoots = useMemo(
    () => tiles.filter((tile) => tile.dr === half || tile.dc === half),
    [tiles, half],
  );

  // Tree positions use the current rendered order, not each check-in's global
  // history index. This matters for period filters: a month may contain items
  // numbered 40..44, but they still need five unique tiles in this island.
  const positioned = useMemo(
    () => {
      const occupied = new Set<string>();
      const assignments = checkIns.map((checkIn, order) => {
        const tile = spiralTile(order);
        const key = `${tile.dr}:${tile.dc}`;
        if (__DEV__) {
          if (occupied.has(key)) console.warn(`[ForestIsland] duplicate tree tile: ${key}`);
          occupied.add(key);
        }
        const p = tileToScreen(tile.dc, tile.dr);
        return {
          checkIn,
          x: cx + p.x,
          y: cy + p.y,
          row: tile.dr + half,
          col: tile.dc + half,
          depth: tile.dr + tile.dc,
        };
      });
      return assignments
        .sort((a, b) => a.depth - b.depth || a.checkIn.index - b.checkIn.index);
    },
    [checkIns, grid, cx, cy],
  );

  const fittedHeight = canvasH * fitScale;
  useEffect(() => {
    if (__DEV__ && SHOW_FOREST_DEBUG) {
      console.log(
        '[ForestIsland] tree assignments',
        positioned.map(({ checkIn, row, col, x, y }) => ({ attemptId: checkIn.attemptId, row, col, x, y })),
      );
    }
  }, [positioned]);
  // Keep the pinch viewport in sync with the exact fitted height. Deferred to
  // an effect so the parent setState never fires during this render pass.
  useEffect(() => {
    onLayout?.(fittedHeight);
  }, [fittedHeight, onLayout]);

  return (
    <View style={{ width: availableWidth, height: canvasH * fitScale, overflow: 'hidden' }}>
      <View
        style={[
          styles.canvas,
          {
            width: canvasW,
            height: canvasH,
            left: Math.round(availableWidth / 2 - canvasW / 2),
            transform: [{ scale: fitScale }],
          },
        ]}
      >
        {/* Floating ground shadow and continuous soil extrusion share the grid footprint. */}
        {diamond(grassFootprintW, forestColors.shadow, cx, cy + WALL_DEPTH + islandH * 0.05)}
        {diamond(grassFootprintW, forestColors.soilDark, cx, cy + WALL_DEPTH)}
        {diamond(grassFootprintW, forestColors.soil, cx, cy + WALL_DEPTH * 0.45)}
        {soilRoots.map((tile) => {
          // Symmetric fringe on BOTH front edges: left-front edge (dr === half,
          // not the corner) leans left, right-front edge (dc === half, not the
          // corner) leans right with the same magnitude. The corner tile gets
          // neither so the front point stays clean.
          const soilRoot =
            tile.dr === half && tile.dc !== -half
              ? { offset: -TILE_W * 0.16, rotate: '-24deg' }
              : tile.dc === half && tile.dr !== -half
                ? { offset: TILE_W * 0.16, rotate: '24deg' }
                : null;
          if (!soilRoot) return null;
          return (
            <View
              key={`soil-root-${tile.dr}:${tile.dc}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: tile.x + soilRoot.offset,
                top: tile.y + TILE_H * 0.32,
                width: 3,
                height: 6 + ((Math.abs(tile.dr + tile.dc) + 1) % 3) * 2,
                backgroundColor: forestColors.grassLine,
                opacity: 0.72,
                transform: [{ rotate: soilRoot.rotate }],
              }}
            />
          );
        })}
        {speckles.map((s, i) => (
          <View
            key={`speckle-${i}`}
            style={{
              position: 'absolute',
              left: cx + (s.drift - 0.5) * islandW,
              top: cy + islandH / 2 - islandH * 0.5 * s.depth + WALL_DEPTH * 0.34,
              width: s.size,
              height: s.size * 0.5,
              borderRadius: s.size,
              backgroundColor: forestColors.soilSpeckle,
              opacity: 0.7,
            }}
          />
        ))}
        {tiles.map((tile) => <TileFace key={`${tile.dr}:${tile.dc}`} tile={tile} />)}
        {/* Trees, painted back to front */}
        {positioned.map(({ checkIn, x, y, row, col }) => (
          <ForestTree
            key={checkIn.attemptId}
            checkIn={checkIn}
            wind={wind}
            animateIn={animateInAttemptId === checkIn.attemptId}
            reducedMotion={reducedMotion}
            onPress={onSelectTree}
            x={x}
            y={y}
            row={row}
            col={col}
          />
        ))}
      </View>
    </View>
  );
}

export const ForestIsland = memo(ForestIslandComponent);

const styles = StyleSheet.create({
  canvas: { position: 'absolute', top: 0 },
});

