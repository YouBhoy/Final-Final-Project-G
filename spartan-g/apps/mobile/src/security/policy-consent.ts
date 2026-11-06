/** The web contract is a per-sign-in acknowledgement, not a permanent server consent record. */
export interface PortalPolicy { title: string; body: string; version: number }
export interface PolicyActor { owner: string; session: unknown }
export interface PolicyReceipt extends PortalPolicy { owner: string; acceptedAt: string }
export interface PolicyState { owner: string | null; phase: 'loading' | 'review' | 'saving' | 'accepted' | 'error'; policy: PortalPolicy | null; error: string | null }
export function parsePortalPolicy(data: unknown): PortalPolicy {
  const d = data as Partial<PortalPolicy> | null;
  if (!d || typeof d.title !== 'string' || !d.title.trim() || d.title.length > 120 || typeof d.body !== 'string' || !d.body.trim() || d.body.length > 20000 || !Number.isInteger(d.version) || d.version! < 1) throw new Error('Policy unavailable');
  return { title: d.title, body: d.body, version: d.version! };
}
export function receiptMatches(value: unknown, owner: string, policy: PortalPolicy): value is PolicyReceipt {
  const r = value as Partial<PolicyReceipt> | null;
  return !!r && r.owner === owner && r.title === policy.title && r.body === policy.body && r.version === policy.version && typeof r.acceptedAt === 'string' && Number.isFinite(Date.parse(r.acceptedAt));
}
export function createPolicyConsent(ports: {
  actor(): PolicyActor | null; load(): Promise<PortalPolicy>; read(): Promise<unknown>;
  save(receipt: PolicyReceipt): Promise<void>; now(): Date; timeoutMs?: number;
}) {
  let state: PolicyState = { owner: null, phase: 'loading', policy: null, error: null }, epoch = 0, busy = false;
  const listeners = new Set<() => void>();
  const publish = (value: PolicyState) => { state = value; listeners.forEach(fn => fn()); };
  const same = (actor: PolicyActor | null) => { const current = ports.actor(); return !!actor && current?.owner === actor.owner && current.session === actor.session; };
  async function bounded<T>(operation: Promise<T>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out')), ports.timeoutMs ?? 12000); })]); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async check() {
      const run = ++epoch, actor = ports.actor(); busy = false;
      publish({ owner: actor?.owner ?? null, phase: 'loading', policy: null, error: null });
      if (!actor) { publish({ ...state, phase: 'error', error: 'Your sign-in session could not be verified. Sign out and sign in again.' }); return; }
      try {
        const policy = await bounded(ports.load());
        // Version zero is the exact web starter policy, only returned for an absent server document.
        if (!policy || !policy.title || !policy.body || !Number.isInteger(policy.version) || policy.version < 0) throw new Error('Policy unavailable');
        const receipt = await bounded(ports.read());
        if (run !== epoch || !same(actor)) return;
        publish({ owner: actor.owner, policy, phase: receiptMatches(receipt, actor.owner, policy) ? 'accepted' : 'review', error: null });
      } catch {
        if (run === epoch && same(actor)) publish({ owner: actor.owner, phase: 'error', policy: null, error: 'The policy or saved acknowledgement could not be verified. Connect to the internet and retry. Access remains closed.' });
      }
    },
    async accept(affirmative: boolean) {
      if (affirmative !== true || busy || state.phase !== 'review' || !state.policy) return false;
      const actor = ports.actor(), policy = state.policy, run = epoch;
      if (!actor || actor.owner !== state.owner || !same(actor)) return false;
      busy = true; publish({ ...state, phase: 'saving', error: null });
      try {
        await bounded(ports.save({ ...policy, owner: actor.owner, acceptedAt: ports.now().toISOString() }));
        if (run !== epoch || !same(actor)) return false;
        publish({ owner: actor.owner, policy, phase: 'accepted', error: null }); return true;
      } catch {
        if (run === epoch && same(actor)) publish({ owner: actor.owner, policy, phase: 'review', error: 'Your acknowledgement was not saved. Protected screens remain closed. Please retry or decline.' });
        return false;
      } finally { if (run === epoch) busy = false; }
    },
    dispose() { ++epoch; busy = false; listeners.clear(); state = { owner: null, phase: 'loading', policy: null, error: null }; },
  };
}
