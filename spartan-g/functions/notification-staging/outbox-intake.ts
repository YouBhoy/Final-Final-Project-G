import { createHash, randomUUID } from 'node:crypto';
import { FieldPath, Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { App } from 'firebase-admin/app';
import { MESSAGE_OUTBOX_COLLECTION, messageOutboxId } from '../../packages/shared-services/src/notifications/message-outbox';
import type { CanonicalChange } from '../notification-preparation/automatic-events';
import type { PushStore } from '../../services/student-support/notification-runtime';
import { PROJECT } from './control';
import { compareStamp, validStamp, type Stamp } from './message-discovery';

export const OUTBOX_HOSTING_APPROVED = false;
export const OUTBOX_STATE = 'notification_rate_limits/staging_outbox_capture';
type Cursor = { id: string; createdAt: Stamp };
export type OutboxRow = Cursor & { schemaVersion: 1; kind: 'message.created'; messageId: string; conversationId: string; senderId: string };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const segment = (s: unknown): s is string => typeof s === 'string' && !!s && !s.includes('/') && !['.', '..'].includes(s);
const compare = (a: Cursor, b: Cursor) => compareStamp(a.createdAt, b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function validateOutbox(row: OutboxRow) {
  if (!row || Object.keys(row).sort().join(',') !== 'conversationId,createdAt,id,kind,messageId,schemaVersion,senderId'
    || row.schemaVersion !== 1 || row.kind !== 'message.created' || typeof row.messageId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.messageId)
    || row.id !== messageOutboxId(row.messageId) || !segment(row.conversationId) || !segment(row.senderId) || !validStamp(row.createdAt)) throw Error('Invalid immutable message event');
}

/** No handler, timer, default control or sender is installed. Hosted composition
 * remains source-disabled; the creator below is for explicit trusted ports/tests. */
export function prepareOutboxIntake(ports: Parameters<typeof createOutboxIntake>[0]) {
  if (!OUTBOX_HOSTING_APPROVED) return { enabled: false as const };
  return { enabled: true as const, capture: createOutboxIntake(ports) };
}
export function createOutboxIntake(ports: {
  enabled: boolean; project: string; ownerUid: string; store: PushStore; now(): number;
  /** Must use the existing recipient/budget/30-minute staging policy, not a client flag. */
  allow(): Promise<boolean>; serverTime(): Promise<Stamp>;
  page(after: Cursor | null, until: Stamp, limit: number): Promise<OutboxRow[]>;
  capture(change: CanonicalChange): Promise<'recorded' | 'duplicate' | 'disabled'>; nonce?(): string;
}) {
  if (ports.project !== PROJECT || !/^[A-Za-z0-9_-]{1,128}$/.test(ports.ownerUid)) throw Error('Staging outbox isolation rejected');
  const owner = hash(PROJECT + ':' + ports.ownerUid);
  return async (signal?: AbortSignal) => {
    if (!ports.enabled || !await ports.allow()) return 'disabled' as const;
    const lease = (ports.nonce ?? randomUUID)(), started = ports.now();
    const previous = await ports.store.transaction(async tx => {
      const row = await tx.get(OUTBOX_STATE);
      if (row && (row.project !== PROJECT || row.owner !== owner || row.phase !== 'idle')) return false;
      tx.set(OUTBOX_STATE, { ...row, project: PROJECT, owner, phase: 'running', lease, startedAt: started }); return row;
    });
    if (previous === false) return 'review-required' as const;
    async function live() { if (signal?.aborted || ports.now() - started >= 12000 || !await ports.allow()) throw Error('Outbox capture stopped'); }
    async function checkpoint(patch: Record<string, unknown>) {
      await ports.store.transaction(async tx => { const row = await tx.get(OUTBOX_STATE);
        if (row?.phase !== 'running' || row.lease !== lease) throw Error('Outbox lease changed'); tx.set(OUTBOX_STATE, { ...row, ...patch }); });
    }
    try {
      await live(); const until = await ports.serverTime(); if (!validStamp(until)) throw Error('Invalid server watermark');
      let after: Cursor | null = previous?.cursor ?? null;
      if (after && (!segment(after.id) || !validStamp(after.createdAt) || compareStamp(after.createdAt, until) >= 0)) throw Error('Invalid outbox cursor');
      let captured = previous?.captured ?? 0, expired = previous?.expired ?? 0;
      if (![captured, expired].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('Invalid capture metrics');
      for (let page = 0; page < 2; page++) {
        await live(); const rows = await ports.page(after, until, 20);
        if (!Array.isArray(rows) || rows.length > 20) throw Error('Unbounded outbox page');
        for (const row of rows) {
          validateOutbox(row);
          if (compareStamp(row.createdAt, until) >= 0 || (after && compare(row, after) <= 0)) throw Error('Outbox order rejected');
          await live(); const occurredAt = row.createdAt.seconds * 1000 + Math.floor(row.createdAt.nanoseconds / 1000000);
          const path = 'notification_rate_limits/outbox_receipt_' + hash(PROJECT + ':' + row.id);
          const fingerprint = hash(JSON.stringify([row.id, row.messageId, row.conversationId, row.senderId, row.createdAt.seconds, row.createdAt.nanoseconds]));
          const prior = await ports.store.get(path);
          if (prior && (prior.project !== PROJECT || prior.fingerprint !== fingerprint || !['captured', 'expired'].includes(prior.status))) throw Error('Outbox evidence changed');
          let status = prior?.status;
          if (!prior) {
            const stale = ports.now() - occurredAt >= 3600000;
            if (!stale) {
              const result = await ports.capture({ id: 'outbox_' + row.id, occurredAt, collection: 'messages', documentId: row.messageId,
                before: null, after: { senderId: row.senderId, conversationId: row.conversationId } });
              if (!['recorded', 'duplicate'].includes(result)) throw Error('Capture unavailable');
            }
            // Old events remain durably classified, never re-dated to bypass the
            // existing one-hour event validity or the 30-minute pilot controls.
            await ports.store.transaction(async tx => { const receipt = await tx.get(path);
              if (receipt && (receipt.project !== PROJECT || receipt.fingerprint !== fingerprint)) throw Error('Conflicting receipt');
              if (!receipt) tx.set(path, { project: PROJECT, fingerprint, outboxId: row.id, messageId: row.messageId,
                status: stale ? 'expired' : 'captured', capturedAt: ports.now(), captureDelayMs: Math.max(0, ports.now() - occurredAt) }); });
            status = stale ? 'expired' : 'captured';
          }
          // A receipt can precede a page checkpoint after a crash. Rows beyond
          // that checkpoint still count once when safely replayed as intake.
          if (status === 'expired') expired++; else captured++;
          after = { id: row.id, createdAt: row.createdAt };
        }
        await checkpoint({ cursor: after, captured, expired, observedUntil: until });
        if (rows.length < 20) break;
      }
      await checkpoint({ phase: 'idle', finishedAt: ports.now() }); return 'captured' as const;
    } catch { await checkpoint({ phase: 'review-required', finishedAt: ports.now() }); return 'review-required' as const; }
  };
}

/** Projection only. The host must still attest the exact staging Admin app. */
export function createOutboxReader(db: Firestore, app: App) {
  if (app.options.projectId !== PROJECT || db !== getFirestore(app, '(default)') || db.databaseId !== '(default)') throw Error('Outbox database mismatch');
  const stamp = (v: Timestamp): Stamp => ({ seconds: v.seconds, nanoseconds: v.nanoseconds });
  return {
    async serverTime() { return stamp((await db.collection(MESSAGE_OUTBOX_COLLECTION).limit(1).select('createdAt').get()).readTime); },
    async page(after: Cursor | null, until: Stamp, limit: number) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 20 || !validStamp(until)) throw Error('Invalid outbox query');
      let query = db.collection(MESSAGE_OUTBOX_COLLECTION).where('createdAt', '<', new Timestamp(until.seconds, until.nanoseconds))
        .orderBy('createdAt').orderBy(FieldPath.documentId()).select('schemaVersion', 'kind', 'messageId', 'conversationId', 'senderId', 'createdAt').limit(limit);
      if (after) query = query.startAfter(new Timestamp(after.createdAt.seconds, after.createdAt.nanoseconds), after.id);
      return (await query.get()).docs.map(d => { const row = d.data(); if (!(row.createdAt instanceof Timestamp)) throw Error('Timestamp required');
        const result = { ...row, id: d.id, createdAt: stamp(row.createdAt) } as OutboxRow; validateOutbox(result); return result; });
    },
  };
}
