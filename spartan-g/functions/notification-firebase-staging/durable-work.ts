import { createHash, randomUUID } from 'node:crypto';
import type { CanonicalChange } from '../notification-preparation/automatic-events';
import type { PushStore } from '../../services/student-support/notification-runtime';
import { LIMITS, PROJECT } from './policy';

export type Work = { kind: 'change'; change: CanonicalChange } | { kind: 'reminder'; appointmentId: string; revision: string };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
// Firestore/SDK map ordering is not an identity guarantee. Fingerprints must
// survive equivalent maps being returned with a different insertion order.
const fingerprint = (work: Work, dueAt: number, expiresAt: number) => hash(JSON.stringify([work, dueAt, expiresAt], (_key, value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value));
export const workPath = (key: string) => {
  if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid notification work key');
  return 'notification_rate_limits/firebase_work_' + key;
};
type Result = { next: string | null };

/** Server-only metadata. No trigger, listener, scheduler or network client is installed.
 * A crashed/ambiguous page is never automatically leased again. */
export function createDurableWork(ports: {
  enabled: boolean; store: PushStore; now(): number;
  process(work: Work, cursor: string | null, signal: AbortSignal): Promise<Result>;
  nonce?(): string; deadlineMs?: number;
}) {
  const now = ports.now, deadlineMs = ports.deadlineMs ?? LIMITS.workDeadlineMs;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > LIMITS.workDeadlineMs) throw Error('Invalid work deadline');
  async function enqueue(key: string, work: Work, dueAt: number, expiresAt: number) {
    if (!ports.enabled) return 'disabled' as const;
    if (!Number.isSafeInteger(dueAt) || !Number.isSafeInteger(expiresAt) || dueAt < 0 || expiresAt <= dueAt || expiresAt <= now()) throw Error('Invalid work window');
    const digest = fingerprint(work, dueAt, expiresAt);
    return ports.store.transaction(async tx => {
      const path = workPath(key), prior = await tx.get(path);
      if (prior) { if (prior.fingerprint !== digest || prior.project !== PROJECT) throw Error('Conflicting notification source event'); return 'duplicate' as const; }
      tx.set(path, { project: PROJECT, kind: 'firebase-work-v1', work, fingerprint: digest, dueAt, expiresAt, cursor: null, pages: 0, state: 'pending', createdAt: now() });
      return 'recorded' as const;
    });
  }
  return {
    enqueue,
    async change(change: CanonicalChange) {
      if (!ports.enabled) return 'disabled' as const;
      // The trusted SDK intake normalizes the event. No HTTP route accepts changes.
      const key = hash(PROJECT + ':event:' + change.id);
      return enqueue(key, { kind: 'change', change }, change.occurredAt, change.occurredAt + 3600000);
    },
    async run(key: string) {
      if (!ports.enabled) return 'disabled' as const;
      const path = workPath(key), lease = (ports.nonce ?? randomUUID)();
      const acquired = await ports.store.transaction(async tx => {
        const row = await tx.get(path);
        if (!row) return null;
        if (row.project !== PROJECT || row.kind !== 'firebase-work-v1' || row.fingerprint !== fingerprint(row.work, row.dueAt, row.expiresAt)) throw Error('Invalid notification work record');
        if (row.state !== 'pending' || row.dueAt > now()) return null;
        if (row.expiresAt <= now()) { tx.set(path, { ...row, state: 'expired' }); return null; }
        if (!Number.isSafeInteger(row.pages) || row.pages < 0 || row.pages >= LIMITS.maxAudiencePages) throw Error('Work page budget exhausted');
        tx.set(path, { ...row, state: 'processing', lease, startedAt: now() }); return row;
      });
      if (!acquired) return 'not-acquired' as const;
      const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([ports.process(acquired.work, acquired.cursor, controller.signal),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('Notification work deadline')); }, deadlineMs); })]);
        if (controller.signal.aborted || !result || (result.next !== null && (!/^[a-f0-9]{64}$/.test(result.next) || result.next === acquired.cursor))
          || (result.next !== null && acquired.pages + 1 >= LIMITS.maxAudiencePages)) throw Error('Invalid work continuation');
        await finish(result.next === null ? 'complete' : 'pending', result.next);
        return result.next === null ? 'complete' as const : 'continued' as const;
      } catch {
        controller.abort(); await finish('review-required', acquired.cursor); return 'review-required' as const;
      } finally { clearTimeout(timer); controller.abort(); }
      async function finish(state: string, cursor: string | null) {
        await ports.store.transaction(async tx => {
          const row = await tx.get(path);
          if (row?.state !== 'processing' || row.lease !== lease) throw Error('Notification work ownership changed');
          tx.set(path, { ...row, state, cursor, pages: acquired!.pages + (state === 'review-required' ? 0 : 1), finishedAt: now() });
        });
      }
    },
  };
}
