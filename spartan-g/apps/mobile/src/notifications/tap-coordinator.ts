import { safePushContent, type PushEnvelope, type PushCategory } from '@spartan-g/shared-services/src/notifications/push-contract';
export interface TapContext { owner: string | null; role: 'student' | 'facilitator' | null; session: unknown; ready: boolean; bindingId: string | null }
export type PushRoute = { name: 'conversation'; conversationId: string } | { name: 'appointments' } | { name: 'assessments' } | { name: 'home' };
export interface AuthorizedTap { owner: string; eventId: string; bindingId: string; category: PushCategory; route: PushRoute }
export function validRoute(category: PushCategory, route: PushRoute): boolean {
  return !!route && (category === 'message' ? route.name === 'conversation' && Object.keys(route).sort().join(',') === 'conversationId,name'
      && typeof route.conversationId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(route.conversationId)
    : Object.keys(route).join(',') === 'name' && (category === 'appointment' ? route.name === 'appointments' : category === 'system' ? route.name === 'home' : route.name === 'assessments'));
}
export function createTapCoordinator(ports: {
  now(): number; context(): TapContext;
  /** Must resolve against a trusted, online, authorized source; never resolve from payload alone. */
  resolve(envelope: PushEnvelope, context: TapContext): Promise<AuthorizedTap | null>;
  navigate(route: PushRoute, context: TapContext): void;
}) {
  let inFlight: Promise<void> | null = null, rerun = false, stopped = false, owner = ports.context().owner, generation = 0;
  const queue: { envelope: PushEnvelope; owner: string | null }[] = [];
  const seen = new Set<string>();
  const synchronize = () => {
    const current = ports.context();
    if (owner && owner !== current.owner) { queue.length = 0; seen.clear(); generation++; }
    owner = current.owner;
  };
  async function processQueue() {
    synchronize();
    if (stopped) return;
      while (queue.length && !stopped) {
        const context = ports.context();
        if (!context.ready || !context.owner || !context.bindingId || !context.role) break;
        const pending = queue[0], envelope = pending.envelope, revision = generation;
        if (envelope.expiresAt <= ports.now() || envelope.bindingId !== context.bindingId || (pending.owner && pending.owner !== context.owner)) { queue.shift(); continue; }
        let result: AuthorizedTap | null;
        try { result = await ports.resolve(envelope, context); } catch { break; } // Retry only on another explicit readiness/lifecycle event.
        const latest = ports.context();
        if (stopped || revision !== generation || latest.owner !== context.owner || latest.session !== context.session || latest.bindingId !== context.bindingId) break;
        if (!latest.ready) break; // Same owner can complete App Lock, then retry safely.
        queue.shift();
        if (!result || result.owner !== context.owner || result.eventId !== envelope.eventId || result.bindingId !== envelope.bindingId
          || result.category !== envelope.category || !validRoute(envelope.category, result.route) || envelope.expiresAt <= ports.now()) continue;
        try { ports.navigate(result.route, latest); } catch { /* Navigation failure never changes security readiness. */ }
      }
  }
  function drain(): Promise<void> {
    synchronize();
    if (stopped) return Promise.resolve();
    if (inFlight) { rerun = true; return inFlight; }
    inFlight = Promise.resolve().then(processQueue).finally(() => {
      inFlight = null;
      if (rerun && !stopped) { rerun = false; void drain(); }
    });
    return inFlight;
  }
  return {
    accept(content: { title?: unknown; body?: unknown; data?: unknown }) {
      synchronize();
      const envelope = safePushContent(content, ports.now());
      if (!envelope || stopped || seen.has(envelope.eventId) || queue.length >= 8) return false;
      seen.add(envelope.eventId);
      if (seen.size > 128) seen.delete(seen.values().next().value!);
      queue.push({ envelope, owner: ports.context().owner });
      void drain(); return true;
    },
    drain, synchronize,
    pending: () => queue.length,
    stop() { stopped = true; generation++; queue.length = 0; seen.clear(); },
  };
}
