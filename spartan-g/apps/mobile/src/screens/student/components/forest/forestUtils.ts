// ─── Forest isometric redesign — shared logic ──────────────────────────────
// Pure, UI-free helpers for the redesigned My Forest screen:
//   • deterministic seeded randomness (same check-in → same tree, every time)
//   • species derivation (neutral inputs only — never reads scores/risk)
//   • spiral tile placement so the island fills naturally as it grows
//   • period (Day/Week/Month/Year) range + chart bucket helpers
// No backend contract changes: everything derives from existing attempt fields.

import type { AssessmentAttemptDocument } from '@spartan-g/shared-types';

// ─── Deterministic seeded randomness ───────────────────────────────────────
// xmur3 string hash → mulberry32 PRNG. Same input string always yields the
// same stream, so a check-in keeps its tree across sessions and devices.
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic PRNG for a check-in id (stable across sessions). */
export function rngFor(attemptId: string): () => number {
  return mulberry32(xmur3(attemptId)());
}

// ─── Species ───────────────────────────────────────────────────────────────
export type ForestSpecies = 'pine' | 'bush' | 'bloom' | 'bare' | 'golden' | 'sapling';

/** Milestone check-in counts that get a special golden tree. */
export const MILESTONE_COUNTS = [1, 10, 50];

export function milestoneLabel(count: number): string {
  const suffix =
    count % 10 === 1 && count !== 11
      ? 'st'
      : count % 10 === 2 && count !== 12
        ? 'nd'
        : count % 10 === 3 && count !== 13
          ? 'rd'
          : 'th';
  return `${count}${suffix} check-in`;
}

export interface ForestCheckIn {
  attemptId: string;
  /** Global chronological index (0-based) across the student's whole history. */
  index: number;
  date: Date;
  /** Minutes spent on the check-in (startedAt → submittedAt); 0 if unknown. */
  minutes: number;
  species: ForestSpecies;
  /** Milestone ordinal (1, 10, 50…) when this check-in is one, else null. */
  milestone: number | null;
  /** false when this check-in broke a streak (gap > 1 day from the previous). */
  healthy: boolean;
  /**
   * Consecutive-day streak at this check-in (1 = streak (re)started here).
   * Derived from submitted dates only, using the same day-gap rule as
   * garden.service.recordCheckIn.
   */
  streakDay: number;
  /** Human label for the sheet — instruments, or a friendly fallback. */
  instrumentsLabel: string;
  /** 0..1 — answered ÷ total questions (drives tree size, same as v1). */
  growRatio: number;
}

const BASE_SPECIES: ForestSpecies[] = ['pine', 'bush', 'bloom'];

function toDate(ts: unknown): Date {
  const source = ts as { toDate?: () => Date; toMillis?: () => number } | null;
  try {
    if (source?.toDate && typeof source.toDate === 'function') return source.toDate();
    if (source?.toMillis && typeof source.toMillis === 'function') return new Date(source.toMillis());
    if (typeof ts === 'string') return new Date(ts);
    if (ts instanceof Date) return ts;
  } catch {
    /* fall through */
  }
  return new Date();
}

export interface AttemptWithDef {
  attempt: AssessmentAttemptDocument & { id: string };
  /** Assessment definition (or null when unavailable) — neutral question set only. */
  def: { questions?: { id?: string }[] } | null;
}

/**
 * Instrument names for this check-in's assessment, inferred from neutral
 * question id prefixes (phq*, gad*, dass*) — same mapping the old screen used.
 */
function detectInstruments(def: AttemptWithDef['def']): string[] {
  const found = new Set<string>();
  for (const question of def?.questions ?? []) {
    const id = (question.id ?? '').toLowerCase();
    if (id.startsWith('phq')) found.add('PHQ-9');
    else if (id.startsWith('gad')) found.add('GAD-7');
    else if (id.startsWith('dass')) found.add('DASS-21');
  }
  return [...found];
}

/**
 * Build the chronological ForestCheckIn list from submitted/graded attempts.
 * Species/size are seeded by attempt id; a check-in whose date is more than a
 * day after the previous one broke the streak → rendered as a bare tree.
 */
export function buildForestCheckIns(entries: AttemptWithDef[]): ForestCheckIn[] {
  const sorted = [...entries].sort(
    (a, b) => toDate(a.attempt.submittedAt).getTime() - toDate(b.attempt.submittedAt).getTime(),
  );

  // Local-midnight key so two check-ins on the same calendar day count as one
  // streak day (mirrors garden.service.recordCheckIn's 'YYYY-MM-DD' compare).
  const dayKey = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  let streakDay = 0;

  return sorted.map((entry, index) => {
    const attempt = entry.attempt;
    const rand = rngFor(attempt.id);
    const date = toDate(attempt.submittedAt);

    const instruments = detectInstruments(entry.def);
    const totalQuestions = Math.max(entry.def?.questions?.length ?? 0, 1);
    const answered = (attempt.answers ?? []).filter(
      (a) => a.value !== undefined && a.value !== '',
    ).length;
    const growRatio = Math.min(1, answered / totalQuestions);

    // Streak gap: previous chronological check-in on the same or previous day.
    const prev = index > 0 ? sorted[index - 1].attempt.submittedAt : null;
    const prevKey = prev === null ? null : dayKey(toDate(prev));
    const today = dayKey(date);
    const sameDay = prevKey !== null && prevKey === today;
    const consecutive = prevKey !== null && today - prevKey === 86400000;
    const healthy = index === 0 || sameDay || consecutive;

    if (index === 0 || !healthy) streakDay = 1;
    else if (consecutive) streakDay += 1;

    const count = index + 1;
    const milestone = MILESTONE_COUNTS.includes(count) ? count : null;
    let species: ForestSpecies;
    if (milestone) species = 'golden';
    else if (!healthy) species = 'bare';
    else species = BASE_SPECIES[Math.floor(rand() * BASE_SPECIES.length) % BASE_SPECIES.length];

    const minutes = (() => {
      const start = toDate(attempt.startedAt).getTime();
      const end = date.getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
      return Math.max(0, Math.round((end - start) / 60000));
    })();

    return {
      attemptId: attempt.id,
      index,
      date,
      minutes,
      species,
      milestone,
      healthy,
      streakDay,
      instrumentsLabel: instruments.length === 0 ? 'Standard check-in' : instruments.join(' + '),
      growRatio,
    };
  });
}

// ─── Tile placement (deterministic spiral from the island centre) ──────────
export interface TileCoord {
  /** Row offset from the island centre (negative = back/north). */
  dr: number;
  /** Column offset from the island centre. */
  dc: number;
}

let spiralCache: TileCoord[] = [];

function buildSpiral(upto: number): void {
  if (spiralCache.length >= upto) return;
  // Centre first, then expand ring by ring (Chebyshev distance), walking each
  // ring clockwise from its top-left corner. Stable infinite sequence.
  spiralCache = [{ dr: 0, dc: 0 }];
  for (let ring = 1; spiralCache.length < upto; ring++) {
    for (let dc = -ring; dc <= ring; dc++) spiralCache.push({ dr: -ring, dc });
    for (let dr = -ring + 1; dr <= ring; dr++) spiralCache.push({ dr, dc: ring });
    for (let dc = ring - 1; dc >= -ring; dc--) spiralCache.push({ dr: ring, dc });
    for (let dr = ring - 1; dr >= -ring + 1; dr--) spiralCache.push({ dr, dc: -ring });
  }
}

/** Deterministic tile for the n-th tree (0-based), always the same. */
export function spiralTile(index: number): TileCoord {
  buildSpiral(index + 1);
  return spiralCache[Math.max(0, index)];
}

/** Smallest odd grid size (≥ 5) whose capacity holds `count` trees. */
export function gridForCount(count: number): number {
  let size = 5;
  while (size * size < count) size += 2;
  return size;
}

// ─── Period helpers ────────────────────────────────────────────────────────
export type PeriodMode = 'day' | 'week' | 'month' | 'year';
export const PERIOD_MODES: PeriodMode[] = ['day', 'week', 'month', 'year'];

export interface PeriodRange {
  start: Date;
  end: Date; // exclusive
  label: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function periodRange(mode: PeriodMode, anchor: Date): PeriodRange {
  if (mode === 'day') {
    const start = startOfDay(anchor);
    const end = new Date(start.getTime() + 86400000);
    return {
      start,
      end,
      label: start.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
    };
  }
  if (mode === 'week') {
    // Monday-based week
    const start = startOfDay(anchor);
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
    const end = new Date(start.getTime() + 7 * 86400000);
    return {
      start,
      end,
      label: `${formatShort(start)} – ${formatShort(new Date(end.getTime() - 86400000))}`,
    };
  }
  if (mode === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    return {
      start,
      end,
      label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    };
  }
  const start = new Date(anchor.getFullYear(), 0, 1);
  const end = new Date(anchor.getFullYear() + 1, 0, 1);
  return { start, end, label: `${anchor.getFullYear()}` };
}

/** Move the anchor by exactly one period in `dir` (+1 / −1). */
export function shiftPeriod(mode: PeriodMode, anchor: Date, dir: number): Date {
  const d = new Date(anchor.getTime());
  if (mode === 'day') d.setDate(d.getDate() + dir);
  else if (mode === 'week') d.setDate(d.getDate() + dir * 7);
  else if (mode === 'month') d.setMonth(d.getMonth() + dir);
  else d.setFullYear(d.getFullYear() + dir);
  return d;
}

export interface ChartBucket {
  label: string;
  value: number;
}

/** Buckets of check-in counts for the bar chart, for the given period. */
export function chartBuckets(
  mode: PeriodMode,
  range: PeriodRange,
  checkIns: ForestCheckIn[],
): ChartBucket[] {
  const inBucket = (bStart: number, bEnd: number) =>
    checkIns.filter((c) => c.date.getTime() >= bStart && c.date.getTime() < bEnd).length;

  if (mode === 'day') {
    return Array.from({ length: 24 }, (_, h) => {
      const bStart = range.start.getTime() + h * 3600000;
      return { label: h % 4 === 0 ? `${h}` : '', value: inBucket(bStart, bStart + 3600000) };
    });
  }
  if (mode === 'week') {
    const names = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return names.map((label, i) => {
      const bStart = range.start.getTime() + i * 86400000;
      return { label, value: inBucket(bStart, bStart + 86400000) };
    });
  }
  if (mode === 'month') {
    const days = Math.round((range.end.getTime() - range.start.getTime()) / 86400000);
    return Array.from({ length: days }, (_, i) => {
      const bStart = range.start.getTime() + i * 86400000;
      return {
        label: (i + 1) % 5 === 0 || i === 0 ? `${i + 1}` : '',
        value: inBucket(bStart, bStart + 86400000),
      };
    });
  }
  const names = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  return names.map((label, m) => {
    const bStart = new Date(range.start.getFullYear(), m, 1).getTime();
    const bEnd = new Date(range.start.getFullYear(), m + 1, 1).getTime();
    return { label, value: inBucket(bStart, bEnd) };
  });
}

// ─── Date formatting ───────────────────────────────────────────────────────
export function formatLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
