import { createHash } from 'node:crypto';
import type { createNotificationBackend, PushStore } from '../../services/student-support/notification-runtime';
import { PROJECT } from './control';

export const WATCH = 'notification_rate_limits/staging_watch';
export const POLL = 'notification_rate_limits/staging_poll_state';
type Runtime = ReturnType<typeof createNotificationBackend>;
type Source = { version: string; data: Record<string, any> } | null;
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash = (v: string) => createHash('sha256').update(v).digest('hex');

/** Exact-path synthetic test polling, not a production change stream. First pass only baselines.
 * No collection scans, clinical text, automatic recovery after errors, or caller-supplied events. */
export function createStagingPoller(ports: {
  store: PushStore; runtime: Runtime; allow(uid: string): Promise<boolean>;
  source(path: string): Promise<Source>; now(): number; runId(): string;
}) {
  return async () => {
    if (!ports.runtime.enabled) return 'disabled';
    const watch = await ports.store.get(WATCH);
    if (!watch || watch.project !== PROJECT || !id(watch.studentUid) || !await ports.allow(watch.studentUid)) return 'disabled';
    const paths: string[] = [];
    for (const collection of ['messages', 'appointments', 'assessments', 'announcements']) {
      const values = collection === 'announcements' ? watch[collection] ?? [] : watch[collection];
      if (!Array.isArray(values) || values.length > 3 || values.some(v => !id(v)) || new Set(values).size !== values.length) throw Error('Invalid staging watch');
      paths.push(...values.map(v => collection + '/' + v));
    }
    if (paths.length < 1 || paths.length > 8) throw Error('Staging watch limit');
    const fingerprint = hash(JSON.stringify([watch.studentUid, paths])), runId = ports.runId();
    const acquired = await ports.store.transaction(async tx => {
      const state = await tx.get(POLL);
      // An interrupted, failed or changed watch requires explicit operator review. Never steal a lease.
      if (state && (state.status !== 'idle' || state.watch !== fingerprint)) return false;
      tx.set(POLL, { ...state, watch: fingerprint, status: 'running', runId, startedAt: ports.now() }); return true;
    });
    if (!acquired) return 'review-required';
    const started = ports.now();
    try {
      for (const path of paths) {
        if (ports.now() - started >= 15000 || !await ports.allow(watch.studentUid)) throw Error('Staging poll stopped');
        const checkpoint = 'notification_rate_limits/watch_' + hash(path), previous = await ports.store.get(checkpoint), current = await ports.source(path);
        const matching = previous?.watch === fingerprint;
        if (matching && current && previous.version !== current.version) {
          const docId = path.split('/')[1];
          if (path.startsWith('messages/') && previous.data === null) {
            for (const eventId of await ports.runtime.messageCreated(docId)) await dispatch(eventId);
          } else if (path.startsWith('appointments/') && previous.data && current.data.studentId === watch.studentUid) {
            const eventId = await ports.runtime.appointmentChanged(docId, previous.data, current.data, current.version); if (eventId) await dispatch(eventId);
          } else if (path.startsWith('assessments/')) {
            const eventId = await ports.runtime.assessmentPublished(docId, previous.data, current.data, watch.studentUid, current.version); if (eventId) await dispatch(eventId);
          } else if (path.startsWith('announcements/')) {
            const eventId = await ports.runtime.announcementPublished(docId, previous.data, current.data, watch.studentUid); if (eventId) await dispatch(eventId);
          }
        }
        // A pre-existing accepted appointment may become due without changing its version.
        if (matching && path.startsWith('appointments/') && current?.data.studentId === watch.studentUid) {
          const eventId = await ports.runtime.appointmentReminder(path.split('/')[1]); if (eventId) await dispatch(eventId);
        }
        await ports.store.transaction(async tx => {
          const state = await tx.get(POLL); if (state?.status !== 'running' || state.runId !== runId) throw Error('Staging poll ownership changed');
          tx.set(checkpoint, { watch: fingerprint, version: current?.version ?? null, data: current?.data ?? null });
        });
      }
      await finish('idle'); return 'complete';
    } catch {
      await finish('review-required'); return 'review-required';
    }
    async function dispatch(eventId: string) {
      // The core reauthorizes canonical recipients. This host additionally restricts the recipient.
      const event = await ports.store.get('notification_events/' + eventId);
      if (event?.recipientUid !== watch!.studentUid) return;
      const results = await ports.runtime.deliver(eventId);
      if (results.includes('unavailable')) throw Error('Staging delivery requires review');
    }
    async function finish(status: string) {
      await ports.store.transaction(async tx => {
        const state = await tx.get(POLL); if (state?.runId !== runId) throw Error('Staging poll ownership changed');
        tx.set(POLL, { ...state, status, finishedAt: ports.now() });
      });
    }
  };
}
