# FOREST_ALIGNMENT_AUDIT.md

**Audit date:** 2026-09-23
**Repo root:** `c:\xampp\htdocs\Final-Final-Project-G`
**Branch / commit:** `app` / `ac48980`
**Scope:** Read-only audit of how the *My Forest* isometric grass tile grid is
rendered. **No code was modified.** All paths below are relative to the repo root.

The island is **not** an image/SVG at all — every grass tile (and the whole soil
base, shadow, speckles, and trees) is drawn from plain React Native `View`s using
`backgroundColor` + `transform` (a square is rotated 45° and Y-scaled to 0.5 to
form a 2:1 rhombus/diamond). That fact drives most of the answers below.

---

## 1. Which file(s) render the tile grid

| Concern | File | Path |
|---|---|---|
| Screen shell ("My Forest" screen, scroll/viewport wiring) | `ForestScreen.tsx` | `spartan-g/apps/mobile/src/screens/student/ForestScreen.tsx` |
| **The island itself: tile grid, per-tile position, diamond drawing, soil base** | `ForestIsland.tsx` | `spartan-g/apps/mobile/src/screens/student/components/forest/ForestIsland.tsx` |
| Isometric layout math: `TILE_W/H`, `tileToScreen`, `islandMetrics`, palette | `forestLayout.ts` | `spartan-g/apps/mobile/src/screens/student/components/forest/forestLayout.ts` |
| Tile placement order (`spiralTile`), grid sizing (`gridForCount`) | `forestUtils.ts` | `spartan-g/apps/mobile/src/screens/student/components/forest/forestUtils.ts` |
| Pinch/zoom viewport wrapper (scales the whole canvas) | `ForestCanvas.tsx` | `spartan-g/apps/mobile/src/screens/student/components/forest/ForestCanvas.tsx` |
| Tree rendering (shares tile centre as anchor) | `ForestTree.tsx` | `spartan-g/apps/mobile/src/screens/student/components/forest/ForestTree.tsx` |
| Colour palette (grass / soil / shadow) | `colors.ts` | `spartan-g/packages/shared-ui/src/theme/colors.ts` |

Primary component/path that answers the question: **`ForestIsland.tsx`
(`ForestIslandComponent`, exported as `ForestIsland`)** located at
`spartan-g/apps/mobile/src/screens/student/components/forest/ForestIsland.tsx`.
The grid loop that builds every tile is `ForestIsland.tsx:184-195`.

---

## 2. The exact position formula (and whether it's standard isometric)

The projection is **standard 2:1 isometric**. `forestLayout.ts:35-41`:

```ts
/** Standard isometric grid coordinates: col moves right/down, row left/down. */
export function tileToScreen(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_W / 2),   // 34 px per step
    y: (col + row) * (TILE_H / 2),   // 17 px per step
  };
}
```

with constants `forestLayout.ts:9-11`:

```ts
/** Diamond tile: width is always 2× height (classic 2:1 isometric). */
export const TILE_W = 68;
export const TILE_H = TILE_W / 2;    // 34
```

This is exactly the classic diamond-grid projection
`x = (col − row)·w/2, y = (col + row)·h/2`, plus an origin offset. The screen
origin is applied in `ForestIsland.tsx:148-149, 191`:

```ts
const cx = canvasW / 2;
const cy = TILE_W * 0.95 + islandH / 2;   // 64.6 + islandH/2
...
const p = tileToScreen(dc, dr);
list.push({ dr, dc, x: cx + p.x, y: cy + p.y, depth: dr + dc, shade: tileShade(dr, dc) });
```

So conceptually **yes — it is the standard isometric projection**, not a custom
formula. The board is built with a centred coordinate system: `dr = row − half`,
`dc = column − half` where `half = (grid−1)/2` (centre tile = 0,0).

> Note: `TILE_W / 2` and `TILE_H / 2` are integer (34 and 17), so the *grid
> deltas* are clean. The **fractional pixels** come later from `cx`, `cy`, and
> `side/√2` (see §7).

---

## 3. Anchor point of the formula on each tile

**Each tile is anchored at its diamond CENTRE** (the crossing of the two
diagonals), not the top-left corner.

Every tile is drawn by `diamond()` (`ForestIsland.tsx:27-53`):

```ts
function diamond(size, color, left, top, key?, borderColor?) {
  const side = size / Math.SQRT2;   // Math.SQRT2 — React Native's Math.SQRT2 constant
  return (
    <View
      key={key}
      style={{
        position: 'absolute',
        left: left - side / 2,      // ← recentres so `left/top` is the CENTRE
        top: top - side / 2,
        width: side,
        height: side,
        backgroundColor: color,
        borderWidth: borderColor ? 1 : 0,
        borderColor,
        transform: DIAMOND_TRANSFORM,   // [{ scaleY: 0.5 }, { rotate: '45deg' }]
      }}
    />
  );
}
```

The `- side / 2` offsets recentre the square so that the `(left, top)` argument
passed in (i.e. the tile's `x/y` from §2) is the **centre of the resulting
diamond**. `TileFace` passes the tile centre directly
(`ForestIsland.tsx:74-75`):

```ts
{diamond(TILE_W - 2, edge, tile.x, tile.y, `${tile.dr}:${tile.dc}:edge`)}
{diamond(TILE_W - 4, tile.shade, tile.x, tile.y, `${tile.dr}:${tile.dc}:face`)}
```

Trees use the same centre anchor (`ForestIsland.tsx:227-231`): `x: cx + p.x`,
`y: cy + p.y`.

---

## 4. Tile image/shape asset(s) & how the angle is produced

There are **no image assets and no pre-drawn isometric art** for tiles. Each tile
is a plain, axis-aligned CSS square `View` that is *geometrically rotated/skewed
at render time* via `transform`.

`ForestIsland.tsx:25`:

```ts
const DIAMOND_TRANSFORM = [{ scaleY: 0.5 }, { rotate: '45deg' }];
```

- The square `View` is `side × side` where `side = size / √2`.
- Rotating a square 45° then Y-scaling by 0.5 yields a rhombus whose height is
  exactly **half its width** (2:1), i.e. edge angles `atan2(0.5, 1) ≈ 26.565°`,
  matching `ISO_ANGLE = Math.atan2(TILE_H, TILE_W)` (`forestLayout.ts:33`).
- Consequently the "two faces" of each grass tile (light/dark) are simulated by
  drawing a **larger edge diamond** (`TILE_W − 2 = 66` wide, darker
  `tileEdgeShade` colour) underneath a **smaller inner face diamond**
  (`TILE_W − 4 = 64` wide, the `tile.shade` colour). The visible rim of the edge
  diamond is the darker "grout" outline. See `ForestIsland.tsx:64-106`
  (`tileEdgeShade` + `TileFace`).

So: **not pre-drawn at an angle — the diamond angle is computed at render time**
by the `scaleY(0.5) + rotate(45°)` transform (plus the whole canvas is also
scaled by a float `fitScale`, §6).

---

## 5. Overlap vs edge-to-edge

**Tiles do NOT overlap — they are inset inward from the ideal tessellation, so a
thin (1–2 px) seam is intentionally visible between neighbours.**

For a perfect 2:1 diamond tessellation, a diamond of width `W` sits on a grid
spaced `W/2` horizontally and `W/4` vertically; adjacent points just touch. This
grid uses spacing `34 × 17`, which is the natural spacing for a **68-wide**
diamond. But the rendered diamonds are smaller:

| Layer | Rendered "diameter" | Inset from the 68‑ideal |
|---|---|---|
| Edge diamond | `TILE_W − 2 = 66` | 1 px per side |
| Face diamond | `TILE_W − 4 = 64` | 2 px per side |

Because adjacent diamond centres are still `34 px` apart in x and `17 px` in y, a
66-wide edge diamond leaves ~1 px gap horizontally and ~0.5 px vertically between
neighbour tiles; the 64-wide face leaves ~2 px / ~1 px. This is the **intentional
"grout line / soil seam"** effect — the darker edge diamond shows as a hairline
frame around each grass face (`ForestIsland.tsx:74-75`). So the seams are by
design, but note they make the diamond *outline* rely on micron-thin AA rings,
which is fragile (see §7/§8).

---

## 6. Container sizing / padding / wrapping → clipping / uneven offset

Relevant code:

`ForestIsland.tsx:258-269` (outer container + canvas centring):

```ts
<View style={{ width: availableWidth, height: canvasH * fitScale, overflow: 'hidden' }}>
  <View
    style={[
      styles.canvas,
      {
        width: canvasW,
        height: canvasH,
        left: availableWidth / 2 - canvasW / 2,   // ← horizontal centring
        transform: [{ scale: fitScale }],
      },
    ]}
  >
```

`forestLayout.ts:78-99` (canvas metrics):

```ts
const islandW = grid * TILE_W;
const islandH = grid * TILE_H;
const canvasW = islandW + TILE_W * 1.1;                     // +74.8 → fractional
const canvasH = islandH + WALL_DEPTH + TILE_W * 1.75;       // +22 +119
const fitScale = Math.max(0.45, Math.min(1.25,
                    availableWidth / canvasW, availableHeight / canvasH));
```

Findings:

- **Fractional canvas width → fractional centre.** `TILE_W * 1.1 = 74.8`, so for
  a grid of 5: `canvasW = 340 + 74.8 = 414.8`, `cx = 207.4` (fractional .4).
  `cy = 64.6 + 85 = 149.6` (.6). Every tile centre inherits this `.4/.6`
  fractional offset.
- **Left/right balance.** Width available to the island is
  `windowWidth − spacing.md * 2` (`ForestScreen.tsx:485`) and centring uses
  `availableWidth / 2 − canvasW / 2`. If `availableWidth` is even but `canvasW`
  is fractional, the literal `left` lands on a fractional pixel, shifting the
  whole grid a fraction of a pixel. Because the grid is an odd-sized symmetric
  diamond this doesn't bias one *side* by construction — the asymmetry the user
  sees is almost certainly the **subpixel antialiasing** of the outline, not a
  real per-side padding difference. There is no asymmetric `padding` /
  side-specific `left`/`right` offset in the code: the only centring is
  `availableWidth / 2 − canvasW / 2`, and the canvas has uniform
  `TILE_W * 1.1` side clearance in both directions.
- **Float `fitScale` scaling.** The entire canvas (all diamonds) is multiplied by
  a fractional `fitScale` (`Math.max(0.45, Math.min(1.25, …))`, generally a
  non-integer), which multiplies subpixel offsets further and misaligns the
  rotated diamonds to the device pixel grid (see §7).
- **`overflow: 'hidden'`** on the outer wrap and on the pinch viewport
  (`ForestCanvas.tsx:113`) will clip anything poking out, but with the symmetric
  `TILE_W * 1.1` side clearance the grid itself should not be clipped unevenly
  left/right.
- `availableWidth` for `ForestIsland` equals `viewportWidth` for `ForestCanvas`
  (`windowWidth − spacing.md * 2`, `ForestScreen.tsx:475,485`) so they agree.

---

## 7. Integer vs fractional (subpixel) positions → visible gaps

**Row/column indexes are integers, but the resulting pixel positions are NOT
integers — they are subpixel/fractional in many places.** This is the strongest
candidate for the jagged/uneven look. Sources of fractionality:

1. `cx = canvasW / 2` — `canvasW` ends in `.8` ⇒ `cx` ends in `.4`/`.9`
   (`ForestIsland.tsx:148`, `forestLayout.ts:84`).
   E.g. grid 5 → `cx = 207.4`.
2. `cy = TILE_W * 0.95 + islandH / 2 = 64.6 + …` ⇒ ends in `.6`
   (`ForestIsland.tsx:149`).
3. Every tile: `x = cx + p.x`, `y = cy + p.y` (`ForestIsland.tsx:191`), so all
   tile centres are fractional.
4. Inside `diamond()`: `side = size / √2` is irrational — for size 66,
   `side ≈ 46.669`, `side/2 ≈ 23.334` — so `left = centreX − 23.334` and
   `top = centreY − 23.334` are 3‑decimal‑fractional values
   (`ForestIsland.tsx:36,42-43`).
5. The whole canvas is then **scaled by a float `fitScale`** (often
   non-integer), compounding the fractionality (`ForestIsland.tsx:267`).
6. The edge/face diamonds rely on a 1–2 px *size difference*, not a crisp border,
   so the separations are hairline antialiased rings.

Consequence: adjacent diamonds along a diagonal land on **different fractional
pixel boundaries**, and the sub-pixel AA hairline seams between them render as
irregular, low-contrast jaggies rather than a single crisp diamond silhouette.

A few concrete numbers (grid 5 ⇒ 25 tiles):

- `TILE_W=68`, `TILE_H=34`
- `islandW = 340`, `islandH = 170`
- `canvasW = 340 + 74.8 = 414.8` → `cx = 207.4`
- `cy = 64.6 + 85 = 149.6`
- Centre tile (dr=0, dc=0): `x = 207.4`, `y = 149.6`
- Edge diamond: `side = 66/√2 ≈ 46.669`, `side/2 ≈ 23.334`
- → `left ≈ 207.4 − 23.334 = 184.066`, `top ≈ 149.6 − 23.334 = 126.266`

---

## 8. How the brown "dirt/base" (soil) layer is generated

The soil base is **a separate set of shapes positioned independently, not the
same diamond-per-tile grid math** — but in the *same* centred coordinate space.

`ForestIsland.tsx:271-274`:

```ts
{/* Floating ground shadow and continuous soil extrusion share the grid footprint. */}
{diamond(grassFootprintW, forestColors.shadow, cx, cy + WALL_DEPTH + islandH * 0.05)}
{diamond(grassFootprintW, forestColors.soilDark, cx, cy + WALL_DEPTH)}
{diamond(grassFootprintW, forestColors.soil, cx, cy + WALL_DEPTH * 0.45)}
```

where `grassFootprintW = islandW − 2` (`ForestIsland.tsx:153`) and
`WALL_DEPTH = 22` (`forestLayout.ts:14`).

Key points:

- The dirt/base is **one continuous diamond** of full island width
  (`islandW − 2`), drawn as **three stacked diamond Views** (shadow, `soilDark`
  at `cy + WALL_DEPTH`, and `soil` at `cy + WALL_DEPTH * 0.45`). The `cy + Δ`
  offsets push the soil diamonds **down by `WALL_DEPTH`** so they read as the
  extruded side/thickness below the grass diamond.
- It is **not derived by iterating the tile grid**: it uses `diamond()` on the
  *island footprint* once, using the same `cx, cy` origin and the same
  `islandW`-based size as the grass grid (§2/§3). So it shares the maths' origin
  (and therefore inherits the same fractional `cx/cy`) but is a distinct shape.
- The small brown "roots" (`soilRoots`) ARE derived from the grid: they are
  placed on tiles whose `dr === half` or `dc === half` (front-edge tiles),
  offset by a symmetric lean:
  `ForestIsland.tsx:275-305` — left-front tiles get
  `{ offset: −TILE_W*0.16, rotate: '-24deg' }`, right-front tiles
  `{ offset: TILE_W*0.16, rotate: '24deg' }`, and the front corner tile neither,
  "so the front point stays clean". These use `tile.x/y` (so same fractional
  positions).
- Deterministic speckles on the soil band (`ForestIsland.tsx:197-205, 304-318`)
  are positioned with `cx/cy` and `.drift/.depth` fractions, again independent
  of the tile grid.

---

## Best hypothesis for the jagged / uneven (non-clean-diamond) look

The grid math is correct and symmetric, so the raggedness is almost certainly a
**rendering precision (subpixel) problem** rather than a layout/logic bug:

1. **Fractional origins & centres.** `cx` ends in `.4/.9` (from `canvasW`
   ending `.8`) and `cy` ends in `.6` (from `+ TILE_W*0.95`). Every tile centre,
   and therefore every diamond's `left/top` (which further include the
   irrational `size/√2`), lands on fractional pixels.

2. **Float transform scaling.** The entire canvas is multiplied by a float
   `fitScale` (often non-integer). That scales already-fractional, rotated
   diamonds onto a device-pixel grid in a misaligned way → hairline
   antialiasing seams between tiles instead of one crisp shared edge.

3. **Intentional 1–2 px inset seams.** Tiles are drawn at 66 and 64 wide on a
   68-wide grid spacing, so neighbours are separated by ~1–2 px of background.
   At integer pixels those seams are uniform-ish grout; at the subpixel offsets
   above they render uneven and "jagged," especially along the diamond outline,
   and this is amplified by the float `scale` in step 2.

4. **Composited rendering stack.** Each grass tile is *two* stacked diamonds
   (edge + face) plus the soil/shadow diamonds behind, all rotated/scaled. Each
   extra transformed layer adds its own fractional rounding; combined they
   produce the uneven, fuzzy diamond silhouette the user is seeing.

**Why it isn't a per-side layout bug:** centring is the single symmetric
expression `availableWidth/2 − canvasW/2` and side clearances are uniform
`TILE_W*1.1` on both directions; the grid is odd-sized and centred at `(cx, cy)`.
If the whole island looked uniformly clean but one edge was off, that would point
to clipping/rounding in the float `scale`/centring. But the "jagged, not clean
diamond" symptom is best explained by the combination of **fractional origins,
float `fitScale`, and deliberately inset tile seams**.

### Suggested next checks (no changes made in this audit)
- Quantify, for the current device width, `availableWidth/2 − canvasW/2` and the
  resulting fractional offsets (grid 5 → `.4` / `.6`).
- Test rendering with `fitScale` clamped to a multiple of 1 (or an integer pixel
  scale) and with `cx/cy` rounded to integers — see if the jaggies vanish.
- Confirm RN `transform` array-ordering semantics for
  `[{ scaleY: 0.5 }, { rotate: '45deg' }]` vs `[{ rotate: '45deg' }, { scaleY: 0.5 }]`
  to be sure the diamond uses the intended ~26.565° (2:1) angle on every target
  platform.