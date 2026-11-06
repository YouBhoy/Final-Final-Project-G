import { opaqueId, type PhonePreferences } from '@spartan-g/shared-services/src/notifications/push-contract';
import type { DeviceActor } from './device-registration';
export interface PendingRevocation { bindingId: string; revocationKey: string }
/** Foreground-only proof protocol. Factory is not installed by the production adapter.
 * All durable capability storage must be OS-protected, never AsyncStorage or chat/logs. */
export function createRegistrationProtocol(ports: {
  actor(): DeviceActor | null; random(): string; installationId(): Promise<string>;
  pending(): Promise<PendingRevocation[]>; savePending(value: PendingRevocation): Promise<void>; removePending(id: string, revocationKey: string): Promise<void>;
  request(operation: 'begin' | 'complete' | 'revoke', body: Record<string, unknown>, actor?: DeviceActor): Promise<Record<string, unknown>>;
  timeoutMs?: number;
}) {
  const proofs = new Map<string, string>(), listeners = new Set<() => void>();
  let cancellationEpoch = 0;
  const same = (actor: DeviceActor) => { const current = ports.actor(); return current?.ready && current.owner === actor.owner && current.session === actor.session; };
  async function cancel(pending: PendingRevocation) { await ports.request('revoke', { ...pending }); await ports.removePending(pending.bindingId, pending.revocationKey); }
  async function cleanup() { for (const pending of await ports.pending()) await cancel(pending); }
  return {
    observe(data: unknown) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      const d = data as Record<string, unknown>;
      if (Object.keys(d).sort().join(',') !== 'challengeId,proof,spartanRegistration' || d.spartanRegistration !== '1' || !opaqueId(d.challengeId) || typeof d.proof !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(d.proof)) return;
      if (proofs.size >= 8) proofs.delete(proofs.keys().next().value!);
      proofs.set(d.challengeId, d.proof); listeners.forEach(fn => fn());
    },
    async bind(actor: DeviceActor, token: string, preferences: PhonePreferences) {
      const epoch = cancellationEpoch, current = () => epoch === cancellationEpoch && same(actor);
      let pending: PendingRevocation | null = null;
      try {
      await cleanup(); if (!current()) throw Error('Session changed');
      const revocationKey = ports.random(), installationId = await ports.installationId();
      if (!current()) throw Error('Session changed');
      const response = await ports.request('begin', { token, installationId, preferences, revocationKey }, actor);
      if (!opaqueId(response.challengeId) || !opaqueId(response.bindingId)) throw Error('Registration unavailable');
      const challengeId = response.challengeId, bindingId = response.bindingId;
      // Make pending cancellation durable as soon as begin returns, even after logout.
      pending = { bindingId, revocationKey }; await ports.savePending(pending);
      if (!current()) throw Error('Session changed');
      const proof = await new Promise<string>((resolve, reject) => {
        const check = () => { if (!current()) { clearTimeout(timer); listeners.delete(check); reject(Error('Registration cancelled')); return; }
          const found = proofs.get(challengeId); if (found) { proofs.delete(challengeId); clearTimeout(timer); listeners.delete(check); resolve(found); } };
        const timer = setTimeout(() => { listeners.delete(check); reject(Error('Registration proof unavailable')); }, ports.timeoutMs ?? 20000);
        listeners.add(check); check();
      });
      if (!current()) throw Error('Session changed');
      const completed = await ports.request('complete', { challengeId, proof }, actor);
      if (completed.id !== bindingId || !current()) throw Error('Registration unavailable');
      return { id: bindingId };
      } catch {
        if (pending) { try { await cancel(pending); } catch { /* Keep the exact capability for later cleanup; never retry completion. */ } }
        throw Error('Registration unavailable');
      }
    },
    async revoke(_actor: DeviceActor, bindingId: string) {
      const pending = (await ports.pending()).filter(p => p.bindingId === bindingId); if (!pending.length) throw Error('Cleanup capability unavailable');
      for (const item of pending) await cancel(item);
    },
    cleanup,
    clearProofs() { proofs.clear(); ++cancellationEpoch; listeners.forEach(check => check()); },
  };
}
