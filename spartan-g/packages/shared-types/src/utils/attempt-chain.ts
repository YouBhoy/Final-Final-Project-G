/**
 * Assessment attempt chains.
 *
 * Attempts are stored as `assessment_attempts/{assessmentId}_{studentId}_{n}` with an
 * `attemptNumber` field equal to `n`. Older data may not follow that scheme (random ids,
 * gaps, mismatched numbers). These pure helpers describe such chains and pick the next
 * attempt number so that the client and the Firestore create rule agree on it.
 *
 * `scripts/audit-attempt-chains.mjs` carries a copy of `analyzeAttemptChain`; a test keeps
 * the two in step.
 */

export type ChainIssue = 'id_mismatch' | 'number_mismatch' | 'gap' | 'duplicate_number';

export interface AttemptLike {
  id: string;
  attemptNumber?: unknown;
  status?: unknown;
}

export interface ChainEntry {
  id: string;
  status: string;
  /** The `attemptNumber` field when it is a positive integer. */
  fieldNumber: number | null;
  /** The `{n}` suffix when the id is exactly `{assessmentId}_{studentId}_{n}`. */
  idNumber: number | null;
  issues: ChainIssue[];
}

export interface ChainAnalysis {
  entries: ChainEntry[];
  /** Highest attempt number seen in any id suffix or attemptNumber field (0 when none). */
  highest: number;
  /** Attempts whose status is submitted or graded — what counts toward the limit. */
  finishedCount: number;
  issues: ChainIssue[];
  clean: boolean;
}

export const FINISHED_STATUSES = ['submitted', 'graded'];

/**
 * How the Firestore create rule on assessment_attempts treats the previous attempt. The ONE place
 * this is declared; planNextAttempt uses it unless a caller passes an explicit mode.
 *   'strict'   = attempt n-1 must exist and be finished (the rule that is deployed today).
 *   'tolerant' = attempt n-1 only has to be finished if it exists (the proposed rule). Switch to
 *               this together with that rule change, never before.
 */
export type AttemptPredecessorMode = 'strict' | 'tolerant';
export const ATTEMPT_RULE_PREDECESSOR: AttemptPredecessorMode = 'strict';

const isFinished = (status: unknown) => typeof status === 'string' && FINISHED_STATUSES.includes(status);

export function attemptId(assessmentId: string, studentId: string, n: number): string {
  return `${assessmentId}_${studentId}_${n}`;
}

function idSuffix(assessmentId: string, studentId: string, id: string): number | null {
  const prefix = `${assessmentId}_${studentId}_`;
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  return /^[1-9][0-9]*$/.test(rest) ? Number(rest) : null;
}

export function analyzeAttemptChain(assessmentId: string, studentId: string, attempts: AttemptLike[]): ChainAnalysis {
  const entries: ChainEntry[] = attempts.map((a) => {
    const fieldNumber = Number.isInteger(a.attemptNumber) && (a.attemptNumber as number) > 0 ? (a.attemptNumber as number) : null;
    const idNumber = idSuffix(assessmentId, studentId, a.id);
    const issues: ChainIssue[] = [];
    if (idNumber === null) issues.push('id_mismatch');
    if (idNumber !== null && fieldNumber !== idNumber) issues.push('number_mismatch');
    return { id: a.id, status: typeof a.status === 'string' ? a.status : 'unknown', fieldNumber, idNumber, issues };
  });

  const numbers = entries.flatMap((e) => [e.idNumber, e.fieldNumber]).filter((n): n is number => n !== null);
  const highest = numbers.length ? Math.max(...numbers) : 0;

  // Each attempt's effective number: its id suffix when it has one, else its attemptNumber field.
  const effective = entries.map((e) => e.idNumber ?? e.fieldNumber).filter((n): n is number => n !== null);
  const seen = new Set<number>();
  const issues = new Set<ChainIssue>(entries.flatMap((e) => e.issues));
  for (const n of effective) {
    if (seen.has(n)) issues.add('duplicate_number');
    seen.add(n);
  }
  for (let n = 1; n <= highest; n += 1) {
    if (!seen.has(n)) {
      issues.add('gap');
      break;
    }
  }

  return {
    entries,
    highest,
    finishedCount: attempts.filter((a) => isFinished(a.status)).length,
    issues: [...issues],
    clean: issues.size === 0,
  };
}

export type NextAttemptPlan =
  | { ok: true; attemptNumber: number; attemptId: string; analysis: ChainAnalysis }
  | { ok: false; reason: 'limit'; limit: number; analysis: ChainAnalysis }
  | { ok: false; reason: 'broken_chain'; detail: string; analysis: ChainAnalysis };

export interface PlanOptions {
  /**
   * 'strict'   — matches the deployed rule: attempt n-1 must exist and be finished (n > 1).
   * 'tolerant' — attempt n-1, only if it exists, must be finished (tolerates gaps/legacy ids).
   */
  predecessor?: AttemptPredecessorMode;
}

/**
 * The next attempt number is (highest existing attempt number) + 1, not "finished count + 1",
 * so a gap or a legacy attempt can never make the client pick an id that already exists.
 * `limit` is the effective limit (override if any, else the assessment default).
 */
export function planNextAttempt(
  assessmentId: string,
  studentId: string,
  attempts: AttemptLike[],
  limit: number,
  options: PlanOptions = {},
): NextAttemptPlan {
  const analysis = analyzeAttemptChain(assessmentId, studentId, attempts);
  if (analysis.finishedCount >= limit) return { ok: false, reason: 'limit', limit, analysis };

  const next = analysis.highest + 1;
  if (next > limit) {
    // Fewer finished attempts than the limit, but the numbering has run past it (a gap or legacy numbers).
    return { ok: false, reason: 'broken_chain', detail: `next number ${next} exceeds the limit of ${limit}`, analysis };
  }
  if (next > 1) {
    const previous = analysis.entries.find((e) => e.id === attemptId(assessmentId, studentId, next - 1));
    const mode = options.predecessor ?? ATTEMPT_RULE_PREDECESSOR;
    if (!previous && mode === 'strict') {
      return { ok: false, reason: 'broken_chain', detail: `attempt ${next - 1} does not exist`, analysis };
    }
    if (previous && !isFinished(previous.status)) {
      return { ok: false, reason: 'broken_chain', detail: `attempt ${next - 1} is not finished`, analysis };
    }
  }
  return { ok: true, attemptNumber: next, attemptId: attemptId(assessmentId, studentId, next), analysis };
}
