import { createHash } from 'node:crypto';
import type { PushStore } from '../../services/student-support/notification-runtime';
import type { CanonicalChange } from '../notification-preparation/automatic-events';
import { PROJECT } from './control';

export const DISCOVERY_CONTROL = 'notification_rate_limits/staging_message_discovery';
export const DISCOVERY_STATE = 'notification_rate_limits/staging_message_discovery_state';
export type Stamp = { seconds: number; nanoseconds: number };
export type Position = { createdAt: Stamp; id: string };
export type MessageMetadata = Position & { senderId: string; conversationId: string };
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
export function validStamp(v: any): v is Stamp { return !!v && Object.keys(v).sort().join(',') === 'nanoseconds,seconds'
  && Number.isSafeInteger(v.seconds) && v.seconds >= 0 && v.seconds <= 253402300799
  && Number.isInteger(v.nanoseconds) && v.nanoseconds >= 0 && v.nanoseconds < 1000000000; }
export const compareStamp = (a: Stamp, b: Stamp) => a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
const compare = (a: Position, b: Position) => compareStamp(a.createdAt, b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Capture only: this interface cannot send FCM. Source pages must come from the
 * pinned Admin query, never HTTP JSON. Retained immutable server-time messages are
 * discoverable; deleted/backdated/missing-time records are not a durable event log. */
export function createMessageDiscovery(ports: {
  enabled: boolean; store: PushStore; now(): number; nonce(): string;
  allow(uid: string): Promise<boolean>; serverTime(): Promise<Stamp>;
  page(from: Stamp, until: Stamp, after: Position | null, limit: number): Promise<MessageMetadata[]>;
  capture(change: CanonicalChange): Promise<'recorded' | 'duplicate' | 'disabled'>;
}) {
  return async (signal?: AbortSignal) => {
    if (!ports.enabled) return 'disabled' as const;
    const control = await ports.store.get(DISCOVERY_CONTROL);
    if (!control || control.project !== PROJECT || control.enabled !== true || !id(control.studentUid)
      || Object.keys(control).sort().join(',') !== 'enabled,project,studentUid' || !await ports.allow(control.studentUid)) return 'disabled' as const;
    const fingerprint = hash(PROJECT + ':' + control.studentUid), lease = ports.nonce(), started = ports.now();
    if (!id(lease)) throw Error('Invalid discovery lease');
    const previous = await ports.store.transaction(async tx => {
      const row = await tx.get(DISCOVERY_STATE);
      if (row && (row.project !== PROJECT || row.fingerprint !== fingerprint || row.phase !== 'idle')) return false;
      tx.set(DISCOVERY_STATE, { ...row, project: PROJECT, fingerprint, phase: 'running', lease, startedAt: started }); return row;
    });
    if (previous === false) return 'review-required' as const;
    const live = async () => {
      if (signal?.aborted || ports.now() - started >= 12000 || !await ports.allow(control.studentUid)) throw Error('Message capture stopped');
      const current = await ports.store.get(DISCOVERY_CONTROL);
      if (current?.enabled !== true || current.project !== PROJECT || current.studentUid !== control.studentUid) throw Error('Discovery control changed');
    };
    try {
      await live(); const upper = await ports.serverTime(); if (!validStamp(upper)) throw Error('Invalid server watermark');
      if (!previous) { await checkpoint({ floor: upper, closed: upper, window: null, captured: 0, lastCaptureDelayMs: null }); await finish('idle'); return 'baselined' as const; }
      if (!validStamp(previous.floor) || !validStamp(previous.closed) || compareStamp(previous.floor, previous.closed) > 0
        || compareStamp(upper, previous.closed) < 0) throw Error('Invalid discovery checkpoint');
      const overlap = { seconds: Math.max(0, previous.closed.seconds - 300), nanoseconds: previous.closed.nanoseconds };
      let captured = previous.captured ?? 0;
      if (!Number.isSafeInteger(captured) || captured < 0) throw Error('Invalid capture count');
      let window = previous.window ?? { from: compareStamp(overlap, previous.floor) < 0 ? previous.floor : overlap, until: upper, after: null };
      if (!validStamp(window.from) || !validStamp(window.until) || compareStamp(window.from, previous.floor) < 0
        || compareStamp(window.from, window.until) > 0 || compareStamp(window.until, upper) > 0
        || (window.after && (!id(window.after.id) || !validStamp(window.after.createdAt)
          || compareStamp(window.after.createdAt, window.from) < 0 || compareStamp(window.after.createdAt, window.until) >= 0))) throw Error('Invalid discovery window');
      await checkpoint({ window });
      for (let page = 0; page < 2; page++) {
        await live(); const rows = await ports.page(window.from, window.until, window.after, 20);
        if (!Array.isArray(rows) || rows.length > 20) throw Error('Unbounded message page');
        let position: Position | null = window.after, count = 0, delay: number | null = null;
        for (const row of rows) {
          if (!row || Object.keys(row).sort().join(',') !== 'conversationId,createdAt,id,senderId' || !id(row.id) || !id(row.senderId) || !id(row.conversationId)
            || !validStamp(row.createdAt) || compareStamp(row.createdAt, window.from) < 0 || compareStamp(row.createdAt, window.until) >= 0
            || (position && compare(row, position) <= 0)) throw Error('Invalid ordered message metadata');
          await live(); const occurredAt = row.createdAt.seconds * 1000 + Math.floor(row.createdAt.nanoseconds / 1000000);
          const result = await ports.capture({ id: 'netlify_message_' + row.id, occurredAt, collection: 'messages', documentId: row.id,
            before: null, after: { senderId: row.senderId, conversationId: row.conversationId } });
          if (!['recorded', 'duplicate'].includes(result)) throw Error('Message capture not durable');
          position = { id: row.id, createdAt: row.createdAt }; count += result === 'recorded' ? 1 : 0; delay = Math.max(0, ports.now() - occurredAt);
        }
        // Capture precedes checkpoint. A crash can replay capture, which must be
        // idempotent; it never authorizes replay of a delivery/FCM attempt.
        captured += count;
        if (rows.length < 20) { await checkpoint({ closed: window.until, window: null, captured, lastCaptureDelayMs: delay }); break; }
        window = { ...window, after: position }; await checkpoint({ window, captured, lastCaptureDelayMs: delay });
      }
      await finish('idle'); return 'captured' as const;
    } catch { await finish('review-required'); return 'review-required' as const; }
    async function checkpoint(patch: Record<string, unknown>) {
      await ports.store.transaction(async tx => { const row = await tx.get(DISCOVERY_STATE);
        if (row?.phase !== 'running' || row.lease !== lease) throw Error('Discovery ownership changed');
        tx.set(DISCOVERY_STATE, { ...row, ...patch }); });
    }
    async function finish(phase: string) { await checkpoint({ phase, finishedAt: ports.now() }); }
  };
}
