import { getApps } from 'firebase-admin/app';
import { randomUUID } from 'node:crypto';
import { getFirestore, FieldPath, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createFirebasePushStore } from '../notification-preparation/runtime';
import { createDurableWork } from '../notification-firebase-staging/durable-work';
import { createAutomaticNotificationEvents } from '../notification-preparation/automatic-events';
import { stagingRuntime, type HostContext } from './host';
import { PROJECT, CONTROL, createStagingControl } from './control';
import { DISCOVERY_CONTROL, type Stamp, type Position } from './message-discovery';
import { createOutboxIntake, createOutboxReader, OUTBOX_HOSTING_APPROVED } from './outbox-intake';

/** Uninstalled factory. No entry, timer or schedule is exported. Runtime flags and
 * public requests cannot override this reviewed source gate. No credential is read
 * while false. Creating a key/active release still needs separate authorization. */
export const MESSAGE_DISCOVERY_APPROVED = false;
export function prepareNetlifyMessages(env: Record<string, string | undefined>, context: HostContext) {
  if (!MESSAGE_DISCOVERY_APPROVED || !OUTBOX_HOSTING_APPROVED || env.NOTIFICATIONS_STAGING_ENABLED !== 'true' || env.NOTIFICATIONS_MESSAGE_DISCOVERY_ENABLED !== 'true') return { enabled: false as const };
  return composeNetlifyMessages(env, context);
}
/** SDK projection, shared by the guarded factory and local emulator checks. */
export function createMessageMetadataReader(db: Firestore) {
  const stamp = (value: Timestamp): Stamp => ({ seconds: value.seconds, nanoseconds: value.nanoseconds });
  const timestamp = (value: Stamp) => new Timestamp(value.seconds, value.nanoseconds);
  return {
    async serverTime() { return stamp((await db.collection('messages').limit(1).select('createdAt').get()).readTime); },
    async page(from: Stamp, until: Stamp, after: Position | null, limit: number) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw Error('Invalid metadata page limit');
      let query = db.collection('messages').where('createdAt', '>=', timestamp(from)).where('createdAt', '<', timestamp(until))
        .orderBy('createdAt').orderBy(FieldPath.documentId()).select('senderId', 'conversationId', 'createdAt').limit(limit);
      if (after) query = query.startAfter(timestamp(after.createdAt), after.id);
      return (await query.get()).docs.map(d => { const row = d.data(); if (!(row.createdAt instanceof Timestamp)) throw Error('Server-time message required');
        return { id: d.id, createdAt: stamp(row.createdAt), senderId: row.senderId, conversationId: row.conversationId }; });
    },
  };
}
function composeNetlifyMessages(env: Record<string, string | undefined>, context: HostContext) {
  const initial = stagingRuntime(env, context); // Existing exact site/project/account validation.
  const app = getApps().find(a => a.name === 'spartan-notifications-staging');
  if (!app || app.options.projectId !== PROJECT) throw Error('Staging message runtime unavailable');
  const db = getFirestore(app, '(default)'), store = createFirebasePushStore(db), policy = createStagingControl(store);
  const queue = createDurableWork({ enabled: true, store, now: Date.now, async process(work, _cursor, signal) {
    if (work.kind !== 'change' || work.change.collection !== 'messages') throw Error('Message-only work required');
    const watch = await store.get(DISCOVERY_CONTROL);
    if (watch?.project !== PROJECT || watch.enabled !== true || !await policy.allow(watch.studentUid)) return { next: null };
    const message = await store.get('messages/' + work.change.documentId);
    const conversation = typeof message?.conversationId === 'string' ? await store.get('conversations/' + message.conversationId) : null;
    if (!Array.isArray(conversation?.participantIds) || conversation.participantIds.length !== 2
      || !conversation.participantIds.includes(watch.studentUid) || !conversation.participantIds.includes(message?.senderId)) return { next: null };
    const base = stagingRuntime(env, context, undefined, signal).runtime;
    const runtime = { ...base, async deliver(id: string) {
      const event = await store.get('notification_events/' + id);
      if (event?.recipientUid !== watch.studentUid) return ['suppressed'];
      const result = await base.deliver(id); if (result.includes('unavailable')) throw Error('Message outcome requires review'); return result;
    } };
    const events = createAutomaticNotificationEvents({ runtime, now: Date.now, verifyChange: async () => !signal.aborted,
      audience: async () => { throw Error('Message worker cannot broadcast'); } });
    await events.changed(work.change); return { next: null };
  } });
  // Retained immutable outbox replaces snapshot discovery; the old reader stays
  // exported only for prior compatibility tests, not as an event-source fallback.
  const discover = async (signal?: AbortSignal) => {
    const watch = await store.get(DISCOVERY_CONTROL);
    if (!initial.runtime.enabled || watch?.project !== PROJECT || watch.enabled !== true || typeof watch.studentUid !== 'string'
      || Object.keys(watch).sort().join(',') !== 'enabled,project,studentUid') return 'disabled' as const;
    return createOutboxIntake({ enabled: true, project: PROJECT, ownerUid: watch.studentUid, store, now: Date.now, nonce: randomUUID,
      async allow() {
        const [current, control] = await Promise.all([store.get(DISCOVERY_CONTROL), store.get(CONTROL)]);
        return current?.project === PROJECT && current.enabled === true && current.studentUid === watch.studentUid
          && control?.visibleRemaining > 0 && await policy.allow(watch.studentUid);
      }, ...createOutboxReader(db, app), capture: change => queue.change(change),
    })(signal);
  };
  return { enabled: true as const, discover,
    /** Separate bounded worker. Requires review of its exact queue index; no
     * data scan, index creation or FCM occurs merely by importing this module. */
    async runOne() {
      const page = await db.collection('notification_rate_limits').where('kind', '==', 'firebase-work-v1').where('state', '==', 'pending')
        .where('work.kind', '==', 'change').where('work.change.collection', '==', 'messages')
        .where('dueAt', '<=', Date.now()).orderBy('dueAt').orderBy(FieldPath.documentId()).limit(1).get();
      for (const row of page.docs) await queue.run(row.id.replace(/^firebase_work_/, ''));
    },
  };
}
