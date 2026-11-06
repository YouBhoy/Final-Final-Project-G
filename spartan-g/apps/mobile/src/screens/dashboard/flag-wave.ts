/** Small, precomputed cloth sections; only native transforms change at runtime. */
export const FLAG_WAVE_DURATION = 3600;
export const FLAG_SIZE = { width: 66, height: 87 } as const;
export const FLAG_VIEWBOX = { width: 63, height: 83 } as const;
const left = 12;
const right = 61;
const count = 24;
const samples = 48;
const scale = FLAG_SIZE.width / FLAG_VIEWBOX.width;

export const FLAG_WAVE_INPUT = Array.from({ length: samples + 1 }, (_, index) => index / samples);

export const FLAG_CLOTH_SECTIONS = Array.from({ length: count }, (_, index) => {
  const x = left + (right - left) * index / count;
  const distance = index / (count - 1);
  // The hoist is pinned; the free edge has at most 3.2 dp of gentle travel.
  const amplitude = 1.5 * scale * distance ** 1.5;
  const lag = Math.PI * 2 * 0.8 * distance;
  const rest = Math.sin(-lag);
  const offsets = FLAG_WAVE_INPUT.map((phase, sample) => sample === samples ? 0 :
    Number((amplitude * (Math.sin(Math.PI * 2 * phase - lag) - rest)).toFixed(8)));
  return {
    left: x * scale,
    // A tiny overlap avoids antialiased hairline gaps between fabric sections.
    width: ((right - left) / count + (index === count - 1 ? 0 : 0.24)) * scale,
    offsets,
  };
});
