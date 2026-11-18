/**
 * "Attacker" model: given everything that is PUBLISHED, which values can each
 * suppressed cell still take? A suppressed cell is known to be in {1,2,3,4};
 * the publication passes only if no combination of published totals, complements,
 * labels, etc. narrows that set.
 *
 * Variables are grouped into connected components (cells that share a constraint)
 * and each component is solved exactly by backtracking. Oversized components fail
 * closed: they are reported as leaks rather than assumed safe.
 */

export const DEFAULT_DOMAIN: readonly number[] = [1, 2, 3, 4];

export interface Variable {
  id: string;
  domain?: readonly number[];
}

export interface Constraint {
  description: string;
  vars: readonly string[];
  holds: (values: Readonly<Record<string, number>>) => boolean;
}

export interface AttackerModel {
  variables: readonly Variable[];
  constraints: readonly Constraint[];
}

export interface SolveResult {
  feasible: Record<string, number[]>;
  /** Published constraints contradict each other: data or model is wrong. */
  inconsistent: boolean;
  /** Components too large to solve exactly. */
  oversized: string[][];
}

export interface Leak {
  variable: string;
  feasible: number[];
}

export interface LeakReport extends SolveResult {
  leaks: Leak[];
  ok: boolean;
}

/** sum(vars) + knownPart === total (known part = published exact cells). */
export function sumEquals(
  description: string,
  vars: readonly string[],
  knownPart: number,
  total: number,
): Constraint {
  return {
    description,
    vars,
    holds: (v) => vars.reduce((s, id) => s + (v[id] as number), 0) + knownPart === total,
  };
}

export function predicate(
  description: string,
  vars: readonly string[],
  holds: Constraint['holds'],
): Constraint {
  return { description, vars, holds };
}

export interface SolveOptions {
  /** Components with more variables than this fail closed. Default 12. */
  maxComponentSize?: number;
  /** Search-node budget per component; exceeding it fails closed. Default 5,000,000. */
  maxNodes?: number;
}

export interface LeakOptions extends SolveOptions {
  /** Only these variables must keep their full domain. Default: every variable. */
  protectedIds?: readonly string[];
}

export function solveFeasibleSets(model: AttackerModel, opts: SolveOptions = {}): SolveResult {
  const maxSize = opts.maxComponentSize ?? 12;
  const maxNodes = opts.maxNodes ?? 5_000_000;
  const domains = new Map<string, readonly number[]>();
  for (const v of model.variables) {
    if (domains.has(v.id)) throw new Error(`Duplicate variable: ${v.id}`);
    domains.set(v.id, v.domain ?? DEFAULT_DOMAIN);
  }

  // Union-find over variables that share a constraint.
  const parent = new Map<string, string>();
  for (const id of domains.keys()) parent.set(id, id);
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    while (parent.get(x) !== root) {
      const next = parent.get(x) as string;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  for (const c of model.constraints) {
    if (c.vars.length === 0) throw new Error(`Constraint without variables: ${c.description}`);
    for (const id of c.vars) {
      if (!domains.has(id)) throw new Error(`Unknown variable "${id}" in: ${c.description}`);
    }
    const r0 = find(c.vars[0] as string);
    for (const id of c.vars) parent.set(find(id), r0);
  }

  const components = new Map<string, string[]>();
  for (const id of domains.keys()) {
    const r = find(id);
    const list = components.get(r);
    if (list) list.push(id);
    else components.set(r, [id]);
  }

  const feasible: Record<string, number[]> = {};
  const oversized: string[][] = [];
  let inconsistent = false;

  for (const [root, vars] of components) {
    if (vars.length > maxSize) {
      oversized.push(vars);
      for (const id of vars) feasible[id] = [...(domains.get(id) as readonly number[])];
      continue;
    }
    const cons = model.constraints.filter((c) => find(c.vars[0] as string) === root);
    const order = vars;
    const index = new Map(order.map((v, i) => [v, i] as const));
    const checkAt: Constraint[][] = order.map(() => []);
    for (const c of cons) {
      const last = Math.max(...c.vars.map((v) => index.get(v) as number));
      (checkAt[last] as Constraint[]).push(c);
    }

    const values: Record<string, number> = {};
    const seen = order.map(() => new Set<number>());
    let found = false;
    let nodes = 0;
    let exceeded = false;
    const rec = (i: number): void => {
      if (exceeded) return;
      if (++nodes > maxNodes) {
        exceeded = true;
        return;
      }
      if (i === order.length) {
        found = true;
        order.forEach((v, j) => (seen[j] as Set<number>).add(values[v] as number));
        return;
      }
      const v = order[i] as string;
      for (const x of domains.get(v) as readonly number[]) {
        values[v] = x;
        if ((checkAt[i] as Constraint[]).every((c) => c.holds(values))) rec(i + 1);
      }
    };
    rec(0);

    if (exceeded) {
      oversized.push(vars);
      for (const id of vars) feasible[id] = [...(domains.get(id) as readonly number[])];
      continue;
    }
    if (!found) inconsistent = true;
    order.forEach((v, j) => (feasible[v] = [...(seen[j] as Set<number>)].sort((a, b) => a - b)));
  }

  return { feasible, inconsistent, oversized };
}

export function findLeaks(model: AttackerModel, opts: LeakOptions = {}): LeakReport {
  const result = solveFeasibleSets(model, opts);
  const leaks: Leak[] = [];
  const protectedSet = opts.protectedIds ? new Set(opts.protectedIds) : null;
  for (const v of model.variables) {
    if (protectedSet && !protectedSet.has(v.id)) continue;
    const domain = [...(v.domain ?? DEFAULT_DOMAIN)].sort((a, b) => a - b);
    const feasible = result.feasible[v.id] as number[];
    const same = feasible.length === domain.length && feasible.every((x, i) => x === domain[i]);
    if (!same) leaks.push({ variable: v.id, feasible });
  }
  const ok = leaks.length === 0 && !result.inconsistent && result.oversized.length === 0;
  return { ...result, leaks, ok };
}
