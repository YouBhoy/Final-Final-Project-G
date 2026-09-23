// ─── Isometric layout constants + species palettes ─────────────────────────
// Shared by ForestIsland (grid + platform) and ForestTree (species drawing).
// All numbers are expressed in "design px" at 100% zoom; the island group is
// scaled to fit the device width, so nothing here is device-specific.

import { forestColors } from '@spartan-g/shared-ui';
import { rngFor, type ForestSpecies } from './forestUtils';

/** Diamond tile: width is always 2× height (classic 2:1 isometric). */
export const TILE_W = 68;
export const TILE_H = TILE_W / 2;

/** Visible soil thickness of the island's two lower faces. */
export const WALL_DEPTH = 22;

/** Smallest island grid (odd so a centre tile always exists). */
export const GRID_MIN = 5;

/** Set true only when inspecting tile assignments in a development build. */
export const SHOW_FOREST_DEBUG = false;

/** Extra empty space above the island for tall trees + sway. */
export const TREE_HEADROOM = TILE_W * 1.05;

/** Empty space kept under the island for the front trees and its shadow. */
export const ISLAND_FOOTROOM = TILE_W * 0.95;

/** Zoom limits for the pan/pinch viewport. */
export const MIN_ZOOM = 0.55;
export const MAX_ZOOM = 1.9;

/** Convert a diamond rotation angle (radians) helper math lives in the island. */
export const ISO_ANGLE = Math.atan2(TILE_H, TILE_W); // 26.565° — tan = 0.5

/** Standard isometric grid coordinates: col moves right/down, row left/down. */
export function tileToScreen(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

/** Backwards-compatible name for callers that use centred row/column offsets. */
export function isoProject(dr: number, dc: number): { x: number; y: number } {
  return tileToScreen(dc, dr);
}

/** Painter's-algorithm depth key: smaller = further back = painted first. */
export function depthKey(dr: number, dc: number): number {
  return dr + dc;
}

export interface IslandMetrics {
  /** Grid side used to hold every tree (odd, ≥ GRID_MIN). */
  grid: number;
  /** Rendered island body (grass diamond) size. */
  islandW: number;
  islandH: number;
  /** Full drawing canvas: island + soil thickness + tree headroom. */
  canvasW: number;
  canvasH: number;
  /** Scale applied so the canvas fits the available space. */
  fitScale: number;
  /** On-screen size of the island block after fitting. */
  width: number;
  height: number;
}

/**
 * Layout maths for the island, shared by ForestIsland (drawing) and the screen
 * (gesture viewport sizing) so the two can never disagree.
 */
export function islandMetrics(
  treeCount: number,
  availableWidth: number,
  availableHeight: number,
): IslandMetrics {
  const grid = Math.max(GRID_MIN, gridForCountSafe(treeCount));
  const islandW = grid * TILE_W;
  const islandH = grid * TILE_H;
  // Symmetric shell: the soil shadow extends below the grass diamond; side
  // clearance covers the widest tree canopy at max zoom-out. One rule for both
  // horizontal directions — never a per-side offset.
  const canvasW = islandW + TILE_W * 1.1;
  const canvasH = islandH + WALL_DEPTH + TILE_W * 1.75;
  const fitScale = Math.max(
    0.45,
    Math.min(1.25, availableWidth / canvasW, availableHeight / canvasH),
  );
  return {
    grid,
    islandW,
    islandH,
    canvasW,
    canvasH,
    fitScale,
    width: availableWidth,
    height: canvasH * fitScale,
  };
}

/** Local copy of the grid rule to keep this module free of circular imports. */
function gridForCountSafe(count: number): number {
  let size = GRID_MIN;
  while (size * size < count) size += 2;
  return size;
}

/** Alternating grass shades give the tiles a mown-lawn / checker look. */
export const GRASS_SHADES = [forestColors.grassLight, forestColors.grass, forestColors.grassDark];

export function tileShade(dr: number, dc: number): string {
  const random = rngFor(`tile:${dr}:${dc}`)();
  return GRASS_SHADES[Math.floor(random * GRASS_SHADES.length)];
}

export interface TreePalette {
  /** Trunk / stem. */
  trunk: string;
  /** Main foliage body. */
  canopy: string;
  /** Shadowed foliage (kept for volume). */
  canopyDark: string;
  /** Flowers / highlights / berries. */
  accent: string;
  /** Sparkle dots — only used by the golden milestone tree. */
  sparkle?: string;
}

const PALETTES: Record<ForestSpecies, TreePalette> = {
  pine: {
    trunk: forestColors.trunk,
    canopy: forestColors.pine,
    canopyDark: forestColors.pineDark,
    accent: forestColors.flower,
  },
  bush: {
    trunk: forestColors.trunkDark,
    canopy: forestColors.bush,
    canopyDark: forestColors.bushDark,
    accent: forestColors.bloomPink,
  },
  bloom: {
    trunk: forestColors.pineDark,
    canopy: forestColors.bushDark,
    canopyDark: forestColors.pine,
    accent: forestColors.bloomPurple,
  },
  bare: {
    trunk: forestColors.bare,
    canopy: forestColors.bare,
    canopyDark: forestColors.trunkDark,
    accent: forestColors.soilSpeckle,
  },
  golden: {
    trunk: forestColors.trunk,
    canopy: forestColors.golden,
    canopyDark: forestColors.goldenDeep,
    accent: forestColors.flower,
    sparkle: forestColors.text,
  },
  sapling: {
    trunk: forestColors.trunk,
    canopy: forestColors.grassLight,
    canopyDark: forestColors.grass,
    accent: forestColors.flower,
  },
};

const ALTERNATE_FLOWERS = [forestColors.bloomPink, forestColors.bloomPurple, forestColors.flower];

export interface TreeVariant {
  trunk: string;
  canopy: string;
  canopyDark: string;
  accent: string;
  /** Sparkle dots — only present for the golden milestone tree. */
  sparkle?: string;
  /** Overall size multiplier (0.86 … 1.16) — deterministic per check-in. */
  size: number;
  /** Sway phase in 0..1 — determines when the tree swings in the wind cycle. */
  swayPhase: number;
  /** Sway amplitude multiplier (0.75 … 1.25). */
  swayAmp: number;
  /** Mirror the shape (tilt/branch direction) so twins never look identical. */
  mirror: boolean;
}

/**
 * Deterministic per-check-in variation: same attempt id → same size, same
 * colour nuance, same sway phase, forever. Never derived from a score.
 */
export function treeVariant(attemptId: string, species: ForestSpecies, growRatio: number): TreeVariant {
  const rand = rngFor(`${attemptId}:variant`);
  const palette = PALETTES[species];
  const grow = Math.min(Math.max(growRatio, 0), 1);
  const size = (0.86 + rand() * 0.3) * (0.86 + grow * 0.24);
  return {
    trunk: palette.trunk,
    canopy: palette.canopy,
    canopyDark: palette.canopyDark,
    // Flowering species rotate through the accent pool for extra variety.
    accent:
      species === 'bloom' || species === 'bush'
        ? ALTERNATE_FLOWERS[Math.floor(rand() * ALTERNATE_FLOWERS.length) % ALTERNATE_FLOWERS.length]
        : palette.accent,
    sparkle: palette.sparkle,
    size,
    swayPhase: rand(),
    swayAmp: 0.75 + rand() * 0.5,
    mirror: rand() > 0.5,
  };
}

/** Human-readable species name for accessibility labels. */
export const SPECIES_LABEL: Record<ForestSpecies, string> = {
  pine: 'Pine tree',
  bush: 'Flowering bush',
  bloom: 'Tall flowering plant',
  bare: 'Bare tree',
  golden: 'Golden milestone tree',
  sapling: 'Young sapling',
};
