import {
  feasibleNumeratorInterval,
  SUPPRESSION_MAX,
  type IntervalOptions,
  type NumeratorState,
} from './feasibleInterval';

/** Cutoffs are compared as scaled integers, so 0.10, 0.30 and 0.70 are exact. */
const SCALE = 1_000_000;
/** Denominators below this are never published, whatever the config says. */
export const PRIVACY_MIN_DENOMINATOR = 5;

export type DemandBand = 'Low' | 'Moderate' | 'High' | 'Insufficient data';
export type PositiveBand = 'Limited' | 'Moderate' | 'Adequate' | 'Insufficient data';
export type BandReason = 'ok' | 'denominator' | 'ambiguous' | 'invariant' | 'unknown';

export interface BandResult<B> {
  band: B;
  /** Denominator passes the minimum but not the colour minimum: show band, no colour. */
  lowConfidence: boolean;
  reason: BandReason;
}

export interface DemandConfig {
  minimumDenominator: number;
  colorMinimum: number;
  lowMaximum: number;
  moderateMaximum: number;
}

export interface PositiveConfig {
  minimumDenominator: number;
  colorMinimum: number;
  limitedMaximum: number;
  moderateMaximum: number;
}

function scaled(cutoff: number): number {
  return Math.round(cutoff * SCALE);
}

/** 0 -> first band, 1 -> second, 2 -> third. Upper boundaries are inclusive. */
function bandIndex(n: number, d: number, first: number, second: number): 0 | 1 | 2 {
  const lhs = n * SCALE;
  if (lhs <= scaled(first) * d) return 0;
  if (lhs <= scaled(second) * d) return 1;
  return 2;
}

function validate(cfg: { minimumDenominator: number; colorMinimum: number }, c1: number, c2: number) {
  if (cfg.minimumDenominator < PRIVACY_MIN_DENOMINATOR) {
    throw new Error(`minimumDenominator must be at least ${PRIVACY_MIN_DENOMINATOR}`);
  }
  if (cfg.colorMinimum < cfg.minimumDenominator) {
    throw new Error('colorMinimum must be >= minimumDenominator');
  }
  if (!(c1 >= 0 && c1 < c2)) throw new Error('Cutoffs must satisfy 0 <= first < second');
}

function classify<B extends string>(
  state: NumeratorState,
  denominator: number,
  cfg: { minimumDenominator: number; colorMinimum: number },
  c1: number,
  c2: number,
  labels: readonly [B, B, B],
  insufficient: B,
  opts: IntervalOptions,
): BandResult<B> {
  validate(cfg, c1, c2);
  const no = (reason: BandReason): BandResult<B> => ({ band: insufficient, lowConfidence: false, reason });

  if (state.kind === 'unknown' || !Number.isInteger(denominator)) return no('unknown');
  if (denominator < cfg.minimumDenominator) return no('denominator');

  const iv = feasibleNumeratorInterval(state, denominator, opts);
  if (!iv) return no('invariant');

  const lo = bandIndex(iv.lo, denominator, c1, c2);
  const hi = bandIndex(iv.hi, denominator, c1, c2);
  if (lo !== hi) return no('ambiguous'); // feasible range straddles a boundary

  return { band: labels[lo], lowConfidence: denominator < cfg.colorMinimum, reason: 'ok' };
}

/** Appointment demand, assessment-submission activity. High is the "attention" direction. */
export function classifyDemand(
  state: NumeratorState,
  denominator: number,
  cfg: DemandConfig,
  opts: IntervalOptions = {},
): BandResult<DemandBand> {
  return classify(state, denominator, cfg, cfg.lowMaximum, cfg.moderateMaximum,
    ['Low', 'Moderate', 'High'] as const, 'Insufficient data', opts);
}

/** Participation, completion, coverage, completeness. High is the good direction. */
export function classifyPositive(
  state: NumeratorState,
  denominator: number,
  cfg: PositiveConfig,
  opts: IntervalOptions = {},
): BandResult<PositiveBand> {
  return classify(state, denominator, cfg, cfg.limitedMaximum, cfg.moderateMaximum,
    ['Limited', 'Moderate', 'Adequate'] as const, 'Insufficient data', opts);
}

/**
 * Smallest denominator at which a suppressed count (1..4) is guaranteed to stay
 * inside the lowest band: max(minimumDenominator, ceil(4 / lowMaximum)), inclusive.
 */
export function guaranteedLowDenominator(lowMaximum: number, minimumDenominator: number): number {
  const s = scaled(lowMaximum);
  if (s <= 0) return Infinity;
  const needed = Math.floor((SUPPRESSION_MAX * SCALE + s - 1) / s);
  return Math.max(minimumDenominator, needed);
}
