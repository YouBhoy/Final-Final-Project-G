import type { DeviceActor } from './device-registration';
export type RegistrationPhase = 'disabled' | 'consent-required' | 'permission-required' | 'waiting-for-unlock' | 'registering' | 'registered' | 'retry-pending' | 'offline' | 'cleanup-pending';
export type RegistrationStatus = { phase: RegistrationPhase; busy: boolean; attempts: number };
/** Owns scheduling/status only. Tokens stay inside the existing proof protocol.
 * Retries start a fresh registration only after that protocol's durable cleanup.
 * This never retries an FCM send or an ambiguous completion request. */
export function createAutomaticNotificationRegistration(ports: {
  enabled: boolean; active(): boolean; actor(): DeviceActor | null; consent(): boolean;
  permission(): Promise<boolean>; synchronize(): Promise<boolean>; binding(): { id: string } | null;
  revoke(): Promise<boolean>; cancelProofs(): void;
}) {
  let stopped = false, epoch = 0, inFlight: Promise<boolean> | null = null, rerun = false;
  let timer: ReturnType<typeof setTimeout> | undefined, owner: string | undefined, session: unknown, consent = false;
  let state: RegistrationStatus = { phase: ports.enabled ? 'consent-required' : 'disabled', busy: false, attempts: 0 };
  const listeners = new Set<() => void>(), publish = (phase: RegistrationPhase, attempts = state.attempts) => {
    if (stopped) return;
    state = { phase, busy: phase === 'registering', attempts }; listeners.forEach(fn => fn());
  };
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  function invalidate() { ++epoch; clear(); ports.cancelProofs(); }
  function observe() { if (!stopped && ports.enabled && !inFlight && ports.active() && ports.actor()?.ready && ports.consent() && ports.binding()) publish('registered', 0); }
  function synchronize(): Promise<boolean> {
    if (stopped || !ports.enabled) return Promise.resolve(false);
    const current = ports.actor(), wants = ports.consent();
    if (current?.owner !== owner || current?.session !== session || wants !== consent) {
      invalidate(); owner = current?.owner; session = current?.session; consent = wants;
      publish(current?.ready ? 'consent-required' : 'waiting-for-unlock', 0); rerun = !!inFlight;
    }
    if (!ports.active() || (current && !current.ready)) {
      invalidate(); publish('waiting-for-unlock'); return Promise.resolve(false);
    }
    if (inFlight) return inFlight;
    if (timer !== undefined || (state.phase === 'offline' && state.attempts >= 3)) return Promise.resolve(false);
    const revision = epoch, same = () => !stopped && revision === epoch && ports.active() && ports.consent() === wants
      && ports.actor()?.owner === current?.owner && ports.actor()?.session === current?.session && (!current || ports.actor()?.ready === true);
    const run = Promise.resolve().then(async () => {
      if (!same()) return false;
      if (!current || !wants) {
        const cleaned = await ports.revoke(); if (same()) publish(cleaned ? 'consent-required' : 'cleanup-pending', 0); return false;
      }
      let allowed = false, deadline: ReturnType<typeof setTimeout> | undefined;
      try { allowed = await Promise.race([ports.permission(), new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(Error('Permission unavailable')), 4000); })]); }
      catch { if (same()) publish('offline', 3); return false; } // Unknown is not permission denial.
      finally { if (deadline !== undefined) clearTimeout(deadline); }
      if (!same()) return false;
      if (!allowed) { const cleaned = await ports.revoke(); if (same()) publish(cleaned ? 'permission-required' : 'cleanup-pending', 0); return false; }
      publish('registering', state.attempts + 1);
      let bound = false; try { bound = await ports.synchronize(); } catch { /* No token/provider/native error is exposed. */ }
      if (!same()) return false;
      if (bound && ports.binding()) { publish('registered', 0); return true; }
      if (state.attempts >= 3) { publish('offline'); return false; }
      publish('retry-pending'); clear();
      timer = setTimeout(() => { timer = undefined; void synchronize(); }, state.attempts === 1 ? 5000 : 15000);
      return false;
    }).catch(() => { if (same()) publish('cleanup-pending'); return false; }).finally(() => {
      if (inFlight === run) inFlight = null;
      if (rerun && !stopped) { rerun = false; void synchronize(); }
    });
    inFlight = run; return run;
  }
  return {
    synchronize, observe, invalidate,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => state,
    retry() { if (!ports.enabled || stopped) return Promise.resolve(false); clear(); publish('retry-pending', 0); return synchronize(); },
    dispose() { invalidate(); stopped = true; listeners.clear(); },
  };
}
