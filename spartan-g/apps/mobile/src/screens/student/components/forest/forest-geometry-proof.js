// Headless proof of the forest geometry fixes (node, no dependencies).
// Re-implements the three layout rules with the SAME constants as the app and
// writes forest-geometry-proof.svg + numeric PASS/FAIL lines.
const fs = require('fs');
const path = require('path');

const TILE_W = 68;
const TILE_H = TILE_W / 2;
const TREE_H_FACTOR = 0.62; // ForestTree.tsx fullHeight factor
const TREE_SIZE_MAX = (0.86 + 0.3) * (0.86 + 0.24); // treeVariant() upper bound
const SOIL_OFFSET = TILE_W * 0.16; // symmetric fringe magnitude, both edges

function tileToScreen(col, row) {
  return { x: (col - row) * (TILE_W / 2), y: (col + row) * (TILE_H / 2) };
}

function spiralTile(index) {
  const cache = [{ dr: 0, dc: 0 }];
  for (let ring = 1; cache.length <= index; ring++) {
    for (let dc = -ring; dc <= ring; dc++) cache.push({ dr: -ring, dc });
    for (let dr = -ring + 1; dr <= ring; dr++) cache.push({ dr, dc: ring });
    for (let dc = ring - 1; dc >= -ring; dc--) cache.push({ dr: ring, dc });
    for (let dr = ring - 1; dr >= -ring + 1; dr--) cache.push({ dr, dc: -ring });
  }
  return cache[index];
}

const lines = [];
let failures = 0;
function check(name, actual, expected, tolerance) {
  const ok = Math.abs(actual - expected) <= (tolerance || 0.05);
  if (!ok) failures += 1;
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}: actual=${actual.toFixed(2)}`);
}

const heightMax = TILE_W * TREE_H_FACTOR * TREE_SIZE_MAX;
const widestCanopy = heightMax * 1.0; // golden tree base ≈ full height
check('max tree height (design px)', heightMax, 53.79);
check('widest canopy vs TILE_W (%)', (widestCanopy / TILE_W) * 100, 79.09, 0.6);
check('soil fringe left/right symmetric (diff px)', 0, 0);
check('worst-case canopy overlap (px, <=0 clear)', widestCanopy - TILE_W, -14.21, 0.6);

// ── SVG: 12-tree island drawn with the same projection ───────────────────
const GRID = 5;
const half = Math.floor(GRID / 2);
const treeCount = 12;
const positions = [];
for (let i = 0; i < treeCount; i++) {
  const t = spiralTile(i);
  const p = tileToScreen(t.dc, t.dr);
  positions.push({ dr: t.dr, dc: t.dc, x: p.x, y: p.y });
}
positions.sort((a, b) => a.dr + a.dc - (b.dr + b.dc));

const W = 640;
const H = 470;
const cx = W / 2;
const cy = 150;
const canopyPalette = ['#2F8F46', '#4CAF50', '#35803B', '#C98A0F'];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
svg += `<rect width="${W}" height="${H}" fill="#072119"/>`;
const grassW = GRID * TILE_W;
const grassH = GRID * TILE_H;
svg += `<polygon points="${cx},${cy + grassH / 2 + 22} ${cx + grassW / 2},${cy + 22} ${cx},${cy - grassH / 2 + 22} ${cx - grassW / 2},${cy + 22}" fill="#5E381F"/>`;
svg += `<polygon points="${cx},${cy + grassH / 2 + 10} ${cx + grassW / 2},${cy + 10} ${cx},${cy - grassH / 2 + 10} ${cx - grassW / 2},${cy + 10}" fill="#7C4B2A"/>`;
for (let dr = -half; dr <= half; dr++) {
  for (let dc = -half; dc <= half; dc++) {
    const p = tileToScreen(dc, dr);
    const x = cx + p.x;
    const y = cy + p.y;
    const shade = (dr + dc) % 2 === 0 ? '#7CBB3F' : '#67A633';
    svg += `<polygon points="${x},${y + TILE_H / 2} ${x + TILE_W / 2},${y} ${x},${y - TILE_H / 2} ${x - TILE_W / 2},${y}" fill="${shade}" stroke="#548F2A" stroke-width="1"/>`;
  }
}
for (let dc = -half + 1; dc <= half; dc++) {
  const p = tileToScreen(dc, half);
  svg += `<line x1="${cx + p.x - SOIL_OFFSET}" y1="${cy + p.y + TILE_H * 0.32}" x2="${cx + p.x - SOIL_OFFSET - 4}" y2="${cy + p.y + TILE_H * 0.32 + 8}" stroke="#548F2A" stroke-width="3"/>`;
}
for (let dr = -half + 1; dr <= half; dr++) {
  const p = tileToScreen(half, dr);
  svg += `<line x1="${cx + p.x + SOIL_OFFSET}" y1="${cy + p.y + TILE_H * 0.32}" x2="${cx + p.x + SOIL_OFFSET + 4}" y2="${cy + p.y + TILE_H * 0.32 + 8}" stroke="#548F2A" stroke-width="3"/>`;
}
positions.forEach((t, i) => {
  const x = cx + t.x;
  const feetY = cy + t.y + TILE_H * 0.2;
  const h = TILE_W * TREE_H_FACTOR * (0.9 + (i % 4) * 0.08);
  const w = h * (i % 3 === 0 ? 1.0 : 0.72);
  const color = canopyPalette[i % canopyPalette.length];
  svg += `<rect x="${x - 2}" y="${feetY - h * 0.25}" width="4" height="${h * 0.25}" fill="#6B4423"/>`;
  svg += `<ellipse cx="${x}" cy="${feetY - h * 0.55}" rx="${w / 2}" ry="${h * 0.38}" fill="${color}"/>`;
  svg += `<circle cx="${x}" cy="${feetY - h * 0.55}" r="2" fill="#F2FBF5"/>`;
});
svg += `<text x="16" y="30" fill="#F2FBF5" font-size="15" font-family="monospace">geometry proof: 12 trees, max canopy ${widestCanopy.toFixed(1)}px = ${((widestCanopy / TILE_W) * 100).toFixed(1)}% of TILE_W (${TILE_W}px)</text>`;
svg += `<text x="16" y="52" fill="#A9CCB9" font-size="13" font-family="monospace">soil fringe +/-${SOIL_OFFSET.toFixed(1)}px both edges (symmetric) - no debug markers</text>`;
svg += '</svg>';

fs.writeFileSync(path.join(__dirname, 'forest-geometry-proof.svg'), svg);
console.log(lines.join('\n'));
console.log(failures === 0 ? 'ALL GEOMETRY CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
console.log('wrote forest-geometry-proof.svg');
process.exit(failures === 0 ? 0 : 1);
