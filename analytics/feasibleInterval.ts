/**
 * Public suppression state for a count, and the range of true values an
 * observer of the PUBLIC state can infer. Bands are computed from this range,
 * never from the exact server-side value.
 */

/** Counts 1..SUPPRESSION_MAX are suppressed in public output. Zero is never suppressed. */
export const SUPPRESSION_MAX = 4;

export type NumeratorState =
  | { kind: 'exact'; value: number }
  | { kind: 'suppressed' } // numerator is in 1..4
  | { kind: 'complementSuppressed' } // (denominator - numerator) is in 1..4
  | { kind: 'unknown' }; // missing / unavailable

export interface IntegerInterval {
  lo: number;
  hi: number;
}

export interface IntervalOptions {
  /**
   * true  (default): numerator counts unique members of the denominator cohort,
   *                  so 0 <= numerator <= denominator and complements exist.
   * false: numerator is an event count (e.g. appointment requests per student),
   *        which may exceed the denominator and has no complement.
   */
  proportion?: boolean;
}

/** Server-side: decide what the public state of an exact value is. */
export function classifySuppression(
  value: number,
  denominator: number,
  opts: IntervalOptions = {},
): NumeratorState {
  const proportion = opts.proportion ?? true;
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid count: ${value}`);
  if (!Number.isInteger(denominator) || denominator < 0) {
    throw new Error(`Invalid denominator: ${denominator}`);
  }
  if (proportion && value > denominator) {
    throw new Error(`Numerator ${value} exceeds denominator ${denominator}`);
  }
  if (value >= 1 && value <= SUPPRESSION_MAX) return { kind: 'suppressed' };
  if (proportion) {
    const complement = denominator - value;
    if (complement >= 1 && complement <= SUPPRESSION_MAX) return { kind: 'complementSuppressed' };
  }
  return { kind: 'exact', value };
}

/** Range of true numerators consistent with the public state, or null if invalid/unknown. */
export function feasibleNumeratorInterval(
  state: NumeratorState,
  denominator: number,
  opts: IntervalOptions = {},
): IntegerInterval | null {
  const proportion = opts.proportion ?? true;
  if (!Number.isInteger(denominator) || denominator < 0) return null;

  switch (state.kind) {
    case 'exact': {
      const v = state.value;
      if (!Number.isInteger(v) || v < 0) return null;
      if (proportion && v > denominator) return null;
      return { lo: v, hi: v };
    }
    case 'suppressed': {
      const hi = proportion ? Math.min(SUPPRESSION_MAX, denominator) : SUPPRESSION_MAX;
      return hi >= 1 ? { lo: 1, hi } : null;
    }
    case 'complementSuppressed': {
      if (!proportion) return null; // event counts have no complement
      const lo = Math.max(0, denominator - SUPPRESSION_MAX);
      const hi = denominator - 1;
      return hi >= lo ? { lo, hi } : null;
    }
    case 'unknown':
      return null;
  }
}
