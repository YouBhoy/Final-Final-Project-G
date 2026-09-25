# FOREST_SOIL_ALIGNMENT_AUDIT.md

**Audit date:** 2026-09-23
**Repo root:** `c:\xampp\htdocs\Final-Final-Project-G`
**Scope:** Read-only audit of whether the brown soil/base diamond still shares the
grass tile diamond's outline after the whole-pixel tile fix (documented in
`FOREST_ALIGNMENT_AUDIT.md` + its follow-up diff). **No code was modified.**

**Bug being audited:** the green grass diamond and the brown soil diamond beneath
it no longer share the same outline — soil shows unevenly around the perimeter
instead of forming a clean, uniform border under the grass.

**Headline finding (root cause):**
`grassFootprintW` (the soil footprint) is **still sized to the OLD 66px inset
edge tile** (`islandW − 2`), and its accompanying code comment even still says the
grass "face is inset by 1dp, so the visible outer footprint is two dp narrower
than the mathematical grid width." That premise was invalidated by the alignment
fix, which changed the grass **edge** diamond from `TILE_W − 2` (66, inset) to
`TILE_W` (68, a **full** cell). The grass footprint is now ≈ `grid × 68` (≈
`islandW`), but the soil was never updated, so it stays `islandW − 2` — a
~2 px narrower slab in design terms (≈ 0.24–0.6 px per side after diamond-side
rounding, growing with grid size). The two diamonds therefore no longer share a
single edge, and the residual fractional mismatch (further scaled by the float
`fitScale`) makes the brown lip show unevenly around the perimeter.

---

## 1. Where the soil/base diamond is drawn, and its exact size/position formula

`spartan-g/apps/mobile/src/screens/student/components/forest/ForestIsland.tsx`

The soil footprint constant (`ForestIsland.tsx:154-157`):
```ts
// Each grass face is inset by 1dp, so the visible outer footprint is two dp
// narrower than the mathematical grid width. The extrusion must use that
// same visible boundary or it will peek past the left/right corners.
const grassFootprintW = islandW - 2;
```
The three soil/base diamonds use that same width, centered on `cx` and pushed
down by `WALL_DEPTH` offsets (`ForestIsland.tsx:275-278`):
```ts
{diamond(grassFootprintW, forestColors.shadow,  cx, cy + WALL_DEPTH + islandH * 0.05)}
{diamond(grassFootprintW, forestColors.soilDark, cx, cy + WALL_DEPTH)}            // bottom slab
{diamond(grassFootprintW, forestColors.soil,      cx, cy + WALL_DEPTH * 0.45)}    // near top face
```
`WALL_DEPTH = 22` (`forestLayout.ts:14`). Each is drawn by the same `diamond()`
helper (`ForestIsland.tsx:27-55`), which — **since the alignment fix** — rounds
the square side to an even pixel:
```ts
const side = Math.round(size / Math.SQRT2 / 2) * 2;   // ForestIsland.tsx:39
```
So `diamond(grassFootprintW, …)` also applies the even rounding to the soil size.

Centers: the soil uses the same `cx = Math.round(canvasW / 2)` and the same
`cy = Math.round(TILE_W * 0.95 + islandH / 2)` as the grass grid
(`ForestIsland.tsx:152-153`), shifted only by the `WALL_DEPTH` vertical offsets.

---

## 2. What `islandW` is derived from

`islandW = grid * TILE_W` where `TILE_W = 68` is a **fixed constant**
(`forestLayout.ts:10`, `forestLayout.ts:79`):
```ts
export const TILE_W = 68;
...
const islandW = grid * TILE_W;
```
- `grid` is the odd-numbered grid side (≥ 5), derived only from the check-in count.
- `islandW` is therefore a **mathematical grid-width constant** — it does **not**
  reflect the actual rendered footprint of the per-tile diamonds post-fix.
  Concretely, the grass tile grid's real outer extent is `(g−1)·68 + edgeWidth`,
  where `edgeWidth = roundEven(68/√2)·√2 ≈ 67.88` — i.e. ≈ `68g − 0.12`, not
  exactly `islandW`, and definitely not `islandW − 2`.
- The soil size `grassFootprintW = islandW − 2` is thus **independent of the
  grass grid's real footprint** — it is a stale derived value keyed to the old
  66px inset tile (old footprint = `(g−1)·68 + 66 = 68g − 2 = islandW − 2`, which
  is exactly why `islandW − 2` was the "correct" number before the fix).

So: **yes, `islandW − 2` is computed from a fixed constant and is tied to pre-fix
tile dimensions; it is not dynamically derived from the current `cx`/`cy`/`side`
values the grass tiles use.**

---

## 3. Does the soil center/origin match the grass grid's center?

**Yes — horizontally there is no offset.**
- Grass tiles are laid out at `x = cx + tileToScreen(dc, dr).x` (`ForestIsland.tsx:195`),
  symmetric about the centre tile at `cx`.
- Soil diamonds are centered at `(cx, cy + …)` (`ForestIsland.tsx:276-278`).
Both share the same integer `cx` (and `cy`), so there is **no left/right (or
top) positional offset** between them. The only vertical difference is the
intended `WALL_DEPTH` down-shift used to fake the extrusion/thickness.

Therefore the misalignment is a **size (width) mismatch**, not a positional
offset: the soil is narrower than the grass (see §6 numbers), so the grass's
outer edges overhang the soil rather than the two sharing a boundary.

---

## 4. Is WALL_DEPTH / padding applied asymmetrically?

**No.** `WALL_DEPTH` is a single uniform constant (22), applied as equal downward
offsets (`cy + WALL_DEPTH`, `cy + WALL_DEPTH * 0.45`, `cy + WALL_DEPTH + islandH*0.05`)
to all three soil diamonds — all centered on the same `cx`. There is **no per-side
padding / no left-vs-right / no top-vs-bottom offset** anywhere in the soil drawing
(and the layout's canvas side clearance is the same `TILE_W*1.1` on both sides,
`forestLayout.ts:84`). So the uneven brown cannot be caused by an asymmetric offset;
it is a by-product of the soil *width* being out of sync with the grass width
(§6), not of any asymmetric positioning.

---

## 5. Was the grass grid's post-fix outer edge recalculated anywhere the soil uses?

**No.** The 68-cell change widened the grass edge from 66 → 68, but:
- `grassFootprintW` still reads `islandW - 2` (`ForestIsland.tsx:157`) — it never
  references the actual rendered edge width (`67.88` or `≈ islandW`).
- The `islandW` value is still `grid * TILE_W` (`forestLayout.ts:79`), a constant
  unchanged by the fix.
- The supporting comment (`ForestIsland.tsx:154-156`) still asserts the grass face
  is "inset by 1dp" — i.e. it documents the **pre-fix** 66px/dim state and was
  **left stale** after the edge was changed to a full 68px cell.

In short: the grass's recomputed outer footprint is **not referenced anywhere**;
the soil formula points at a stale/unrelated value.

---

## 6. Numbers + best hypothesis for uneven brown visibility

**Computed for grid sizes 5/7/9/11** (same `diamond()` rounding as the app,
`side = roundEven(size/√2)`, diamond width = `side·√2`):

| grid | `islandW` | grass footprint (68-cell, ≈ `68g−0.12`) | soil `grassFootprintW` (`islandW−2`) | soil rendered width (`side·√2`) | soil narrower than grass (per side) |
|---|---|---|---|---|---|
| 5 | 340 | 339.882 | 338 | 339.411 | 0.235 |
| 7 | 476 | 475.882 | 474 | 475.176 | 0.353 |
| 9 | 612 | 611.882 | 610 | 610.940 | 0.471 |
| 11 | 748 | 747.882 | 746 | 746.705 | 0.589 |

**What this shows:**
- The grass footprint is ≈ `islandW` (i.e. `68g − 0.12`), **not** `islandW − 2`.
- The soil is still `islandW − 2` (design) and, even after even-rounding, renders
  **narrower than the grass by ~0.24–0.59 px per side**, with the gap growing as
  the grid grows.
- Both diamonds share the same center `cx` (§3), so the grey/green boundary is
  misaligned purely because the **soil is narrower**.

**Root-cause hypothesis (why brown shows unevenly rather than uniformly):**
1. **Primary — stale footprint size.** `grassFootprintW = islandW − 2`
   (`ForestIsland.tsx:157`) encodes the **pre-fix** 66 px inset math. The fix
   changed the edge diamond to the **full 68 px cell** but never touched the soil
   size, so the soil slab is ~2 px narrower than the grass (design), ~0.24–0.59 px
   after rounding. The two diamonds no longer share an outline.
2. **Why it reads as "uneven on some sides," not just "thinner":** because the
   whole island is scaled by a float `fitScale` (`ForestIsland.tsx:271`), the
   *fractional* grass edge (`…−0.12`) and soil edge (`…−0.59…−1.18`, grid-dependent)
   land on **different sub-pixel boundaries after scaling**. Wherever they round
   toward each other, the brown lip disappears (grass covers it); wherever they
   round apart, a ~1 px brown sliver is antialiased in. Along the four
   lower-facing perimeter edges this produces an inconsistent 0–1 px brown lip →
   "more visible on some sides than others."
3. **Not** an asymmetric offset: §3/§4 show identical centers and a uniform
   `WALL_DEPTH`, so no per-side padding explains it.

**Likely fix direction (NOT implemented — audit only):** the extrusion width
should match the actual rendered grass footprint, i.e. use the full cell —
`grassFootprintW = islandW` (or better, derive it from the real edge width
`roundEven(TILE_W/√2)·√2` + `(grid−1)·TILE_W`) instead of `islandW − 2`, and update
the stale "inset by 1dp" comment. Whichever is chosen, the soil size should be
recomputed (and, ideally, also resolve to a whole-pixel footprint that shares the
grass edge after `fitScale`).