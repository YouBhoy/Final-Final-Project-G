import { opaqueId } from '@spartan-g/shared-services/src/notifications/push-contract';
import type { PendingRevocation } from './registration-protocol';
/** Caller must inject OS-protected SecureStore, never ordinary preferences storage. */
export function createNotificationCapabilityStore(ports: { read(): Promise<string | null>; write(value: string): Promise<void> }) {
  let tail: Promise<unknown> = Promise.resolve();
  async function read() {
    const raw = await ports.read(); if (raw === null) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length > 8 || rows.some(r => !r || Object.keys(r).sort().join(',') !== 'bindingId,revocationKey' || !opaqueId(r.bindingId) || typeof r.revocationKey !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(r.revocationKey)) || new Set(rows.map(r => r.bindingId + ':' + r.revocationKey)).size !== rows.length) throw Error('Notification cleanup storage unavailable');
    return rows as PendingRevocation[];
  }
  function mutate(update: (rows: PendingRevocation[]) => PendingRevocation[]) {
    const result = tail.then(async () => { const rows = update(await read());
      if (rows.length > 8 || rows.some(r => !opaqueId(r.bindingId) || !/^[A-Za-z0-9_-]{32,128}$/.test(r.revocationKey))) throw Error('Notification cleanup required');
      const encoded = JSON.stringify(rows); if (encoded.length > 2048) throw Error('Notification cleanup required'); await ports.write(encoded);
    });
    tail = result.catch(() => {}); return result;
  }
  return { async pending() { await tail; return read(); },
    savePending(value: PendingRevocation) { return mutate(rows => [...rows.filter(r => r.bindingId !== value.bindingId || r.revocationKey !== value.revocationKey), value]); },
    removePending(id: string, revocationKey: string) { return mutate(rows => rows.filter(r => r.bindingId !== id || r.revocationKey !== revocationKey)); },
  };
}
