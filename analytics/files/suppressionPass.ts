/**
 * Secondary-suppression pass.
 *
 * Primary suppression hides counts of 1..4 ("Fewer than 5"). Because the table
 * structure is public (a total equals the sum of its parts), a published total
 * or exact neighbour can still reveal a hidden cell. This pass withholds the
 * fewest additional cells ("Not shown", with NO claim about their size) until
 * the attacker model can no longer narrow any "Fewer than 5" cell below {1,2,3,4}.
 *
 * Preference order for withholding: exact aggregates, exact other cells (smallest
 * value first), then primary-hidden cells as a last resort. A final pass restores
 * anything that turns out not to be needed.
 */
import { DEFAULT_DOMAIN, findLeaks, type AttackerModel, type Constraint, type LeakReport, type Variable } from './attackerModel';
import { SUPPRESSION_MAX } from '../feasibleInterval';

export type CellState = 'exact' | 'fewerThan5' | 'notShown';

export interface PassCell {
  id: string;
  value: number;
  /** Totals/subtotals are withheld before ordinary cells. */
  aggregate?: boolean;
}

/** total === sum(parts). The same cell may be a total in one relation and a part in another. */
export interface PassRelation {
  id: string;
  total: string;
  parts: readonly string[];
}

export interface PassOptions {
  maxComponentSize?: number;
  maxNodes?: number;
  /** Upper bound the attacker assumes for a "Not shown" cell. Default max(10, 2 * largest value). */
  freeDomainMax?: number;
}

export interface PassResult {
  states: Record<string, CellState>;
  /** Cells withheld beyond primary suppression, in the order they were chosen. */
  secondarilyHidden: string[];
  report: LeakReport;
  iterations: number;
}

export function buildAttackerModel(
  cells: readonly PassCell[],
  relations: readonly PassRelation[],
  states: ReadonlyMap<string, CellState>,
  freeDomainMax: number,
): AttackerModel {
  const byId = new Map(cells.map((c) => [c.id, c] as const));
  const freeDomain = Array.from({ length: freeDomainMax + 1 }, (_, i) => i);

  const variables: Variable[] = [];
  for (const c of cells) {
    const s = states.get(c.id);
    if (s === 'fewerThan5') variables.push({ id: c.id, domain: DEFAULT_DOMAIN });
    else if (s === 'notShown') variables.push({ id: c.id, domain: freeDomain });
  }

  const built: { constraint: Constraint; freeTotal: string | null }[] = [];
  for (const r of relations) {
    const partVars = r.parts.filter((p) => states.get(p) !== 'exact');
    const knownParts = r.parts.reduce(
      (sum, p) => sum + (states.get(p) === 'exact' ? (byId.get(p) as PassCell).value : 0),
      0,
    );
    const totalHidden = states.get(r.total) !== 'exact';
    const vars = totalHidden ? [...partVars, r.total] : partVars;
    if (vars.length === 0) continue;
    const totalValue = (byId.get(r.total) as PassCell).value;
    built.push({
      freeTotal: states.get(r.total) === 'notShown' ? r.total : null,
      constraint: {
        description: `relation ${r.id}`,
        vars,
        holds: (v) =>
          partVars.reduce((s, id) => s + (v[id] as number), 0) + knownParts ===
          (totalHidden ? (v[r.total] as number) : totalValue),
      },
    });
  }

  // A withheld total that appears in only one relation can always be chosen to
  // satisfy it (totals are unbounded and >= 0), so that relation tells the
  // attacker nothing. Dropping it keeps big groups solvable without hiding a leak.
  const occurrences = new Map<string, number>();
  for (const b of built) for (const v of b.constraint.vars) occurrences.set(v, (occurrences.get(v) ?? 0) + 1);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = built.length - 1; i >= 0; i--) {
      const b = built[i] as (typeof built)[number];
      if (b.freeTotal !== null && occurrences.get(b.freeTotal) === 1) {
        for (const v of b.constraint.vars) occurrences.set(v, (occurrences.get(v) as number) - 1);
        built.splice(i, 1);
        changed = true;
      }
    }
  }
  const constraints: Constraint[] = built.map((b) => b.constraint);
  return { variables, constraints };
}

function validate(cells: readonly PassCell[], relations: readonly PassRelation[]): Map<string, PassCell> {
  const byId = new Map<string, PassCell>();
  for (const c of cells) {
    if (byId.has(c.id)) throw new Error(`Duplicate cell id: ${c.id}`);
    if (!Number.isInteger(c.value) || c.value < 0) throw new Error(`Invalid value for ${c.id}: ${c.value}`);
    byId.set(c.id, c);
  }
  for (const r of relations) {
    const total = byId.get(r.total);
    if (!total) throw new Error(`Relation ${r.id}: unknown total ${r.total}`);
    if (new Set(r.parts).size !== r.parts.length) throw new Error(`Relation ${r.id}: duplicate parts`);
    if (r.parts.includes(r.total)) throw new Error(`Relation ${r.id}: total listed as its own part`);
    let sum = 0;
    for (const p of r.parts) {
      const part = byId.get(p);
      if (!part) throw new Error(`Relation ${r.id}: unknown part ${p}`);
      sum += part.value;
    }
    if (sum !== total.value) throw new Error(`Relation ${r.id}: parts sum to ${sum}, total is ${total.value}`);
  }
  return byId;
}

export function runSuppressionPass(
  cells: readonly PassCell[],
  relations: readonly PassRelation[],
  opts: PassOptions = {},
): PassResult {
  const byId = validate(cells, relations);
  const maxValue = cells.reduce((m, c) => Math.max(m, c.value), 0);
  const freeDomainMax = opts.freeDomainMax ?? Math.max(10, 2 * maxValue);

  const base = new Map<string, CellState>();
  for (const c of cells) {
    base.set(c.id, c.value >= 1 && c.value <= SUPPRESSION_MAX ? 'fewerThan5' : 'exact');
  }
  const states = new Map(base);

  const check = (): LeakReport => {
    const protectedIds = cells.filter((c) => states.get(c.id) === 'fewerThan5').map((c) => c.id);
    const options: Parameters<typeof findLeaks>[1] = { protectedIds };
    if (opts.maxComponentSize !== undefined) options.maxComponentSize = opts.maxComponentSize;
    if (opts.maxNodes !== undefined) options.maxNodes = opts.maxNodes;
    return findLeaks(buildAttackerModel(cells, relations, states, freeDomainMax), options);
  };

  const rank = (c: PassCell): [number, number, string] => {
    const hidden = states.get(c.id) === 'fewerThan5' ? 2 : 0;
    const group = hidden + (c.aggregate ? 0 : 1);
    return [group, c.value, c.id];
  };
  const byRank = (a: PassCell, b: PassCell): number => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || (ra[2] < rb[2] ? -1 : ra[2] > rb[2] ? 1 : 0);
  };

  const secondary: string[] = [];
  let report = check();
  let iterations = 0;

  while (!report.ok) {
    if (report.inconsistent) throw new Error('Published constraints are inconsistent; check the input data');
    iterations++;
    const affected = new Set<string>([...report.leaks.map((l) => l.variable), ...report.oversized.flat()]);
    const candidates = new Map<string, PassCell>();
    for (const r of relations) {
      const members = [r.total, ...r.parts];
      if (!members.some((m) => affected.has(m))) continue;
      for (const m of members) {
        if (states.get(m) !== 'notShown') candidates.set(m, byId.get(m) as PassCell);
      }
    }
    const next = [...candidates.values()].sort(byRank)[0];
    if (!next) throw new Error('No cell left to withhold, but the attacker model still finds a leak');
    states.set(next.id, 'notShown');
    secondary.push(next.id);
    report = check();
  }

  // Restore anything not actually needed (most recently withheld first).
  for (const id of [...secondary].reverse()) {
    states.set(id, 'notShown');
    const original = base.get(id) as CellState;
    states.set(id, original);
    const trial = check();
    if (trial.ok) {
      secondary.splice(secondary.indexOf(id), 1);
      report = trial;
    } else {
      states.set(id, 'notShown');
    }
  }
  report = check();

  return {
    states: Object.fromEntries(states) as Record<string, CellState>,
    secondarilyHidden: secondary,
    report,
    iterations,
  };
}
