// No credentials, tokens, prompts or model responses are stored in this ledger.
export type Step = 'basic' | 'tool' | 'summary';
export type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type Action = { status: 'ready' | 'running' | 'passed' | 'failed'; used: number };
export type Ledger = { version: 1; runId: string; localDay: string; used: number; stopped: boolean;
  active: Step | null; actions: Record<Step, Action> };
const steps: Step[] = ['basic', 'tool', 'summary'];
const caps = { basic: 1, tool: 2, summary: 1 };
export class BudgetError extends Error { constructor() { super('Synthetic test budget unavailable or stopped.'); } }
export function localDay() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function createRequestBudget(storage: Storage, runId: string, day: () => string = localDay) {
  const key = '@spartan-g/ai-synthetic/' + runId, marker = key + '/journal';
  let queue: Promise<unknown> = Promise.resolve(), broken = false, active: Step | undefined;
  function serialized<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(async () => { if (broken) throw new BudgetError(); return work(); });
    queue = result.catch(() => undefined); return result;
  }
  function valid(value: unknown): value is Ledger {
    if (!value || typeof value !== 'object') return false;
    const s = value as Ledger;
    return s.version === 1 && s.runId === runId && /^\d{4}-\d{2}-\d{2}$/.test(s.localDay)
      && Number.isSafeInteger(s.used) && s.used >= 0 && s.used <= 4 && typeof s.stopped === 'boolean'
      && (s.active === null || steps.includes(s.active)) && !!s.actions
      && steps.every(k => s.actions[k] && ['ready', 'running', 'passed', 'failed'].includes(s.actions[k].status)
        && Number.isSafeInteger(s.actions[k].used) && s.actions[k].used >= 0 && s.actions[k].used <= caps[k]
        && (s.actions[k].status !== 'passed' || s.actions[k].used === caps[k]))
      && steps.reduce((n, k) => n + s.actions[k].used, 0) === s.used
      && steps.every((k, i) => (s.actions[k].status !== 'ready' || s.actions[k].used === 0)
        && (s.actions[k].status !== 'running' || s.active === k)
        && (s.actions[k].status !== 'failed' || s.stopped)
        && (s.actions[k].status === 'ready' || steps.slice(0, i).every(p => s.actions[p].status === 'passed')))
      && (s.active === null || s.actions[s.active].status === 'running');
  }
  async function load(): Promise<Ledger | null> {
    try {
      const [raw, journal] = await Promise.all([storage.getItem(key), storage.getItem(marker)]);
      if (raw === null && journal === null) return null;
      if (!raw || !journal) throw new BudgetError();
      const s: unknown = JSON.parse(raw), j = JSON.parse(journal);
      if (!valid(s) || j.runId !== runId || j.state !== 'ready' || j.used !== s.used) throw new BudgetError();
      return s;
    } catch { broken = true; throw new BudgetError(); }
  }
  async function persist(s: Ledger) {
    try {
      await storage.setItem(marker, JSON.stringify({ runId, state: 'pending', used: s.used }));
      await storage.setItem(key, JSON.stringify(s));
      await storage.setItem(marker, JSON.stringify({ runId, state: 'ready', used: s.used }));
    } catch { broken = true; throw new BudgetError(); }
  }
  function executable(s: Ledger | null): asserts s is Ledger {
    if (!s || s.stopped || s.localDay !== day() || (s.active !== null && s.active !== active)) throw new BudgetError();
  }
  return {
    snapshot: () => serialized(async () => load()),
    initialize: () => serialized(async () => {
      if (await load()) throw new BudgetError();
      const s: Ledger = { version: 1, runId, localDay: day(), used: 0, stopped: false, active: null,
        actions: { basic: { status: 'ready', used: 0 }, tool: { status: 'ready', used: 0 }, summary: { status: 'ready', used: 0 } } };
      await persist(s); return s;
    }),
    start: (step: Step) => serialized(async () => {
      const s = await load(); executable(s);
      if (s.active || s.actions[step].status !== 'ready' || steps.slice(0, steps.indexOf(step)).some(k => s.actions[k].status !== 'passed')) throw new BudgetError();
      s.actions[step].status = 'running'; s.active = step; await persist(s); active = step;
    }),
    reserve: (kind: 'chat' | 'summary') => serialized(async () => {
      const s = await load(); executable(s);
      if (!active || s.active !== active || s.actions[active].status !== 'running'
          || (kind === 'summary') !== (active === 'summary') || s.used >= 4 || s.actions[active].used >= caps[active]) throw new BudgetError();
      s.used++; s.actions[active].used++;
      // A provider attempt can begin only after all three durable writes succeed.
      await persist(s); return s.used;
    }),
    finish: (success: boolean) => serialized(async () => {
      const s = await load(); executable(s);
      if (!active || s.active !== active) throw new BudgetError();
      const passed = success && s.actions[active].used === caps[active];
      s.actions[active].status = passed ? 'passed' : 'failed'; s.stopped = !passed; s.active = null;
      await persist(s); active = undefined; return s;
    }),
  };
}
