/** Not exported by functions/src/index.ts. No initializeApp(), triggers, timers or credentials. */
import type { Auth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldPath, type Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { createHash } from 'node:crypto';
import { createNotificationBackend, type PushStore } from '../../services/student-support/notification-runtime';
import { createStudentVerifier, firebaseMessage, type SupportProject } from '../../services/student-support/support-runtime';
import { safePushContent } from '../../packages/shared-services/src/notifications/push-contract';
import type { PreparedFcmMessage, SendAttempt } from '../notification-staging/fcm-transport';

/** Expo 0.31's foreground and cold-tap serializers both decode JSON data.body.
 * Keep transport metadata outside the strict, privacy-safe application envelope. */
export function expoCompatibleFcmMessage(message: Parameters<typeof firebaseMessage>[0]) {
  const envelope = safePushContent({ ...message.notification, data: message.data }, message.data.issuedAt);
  if (!envelope) throw Error('Invalid notification envelope');
  const wire = firebaseMessage(message);
  return { ...wire,
    notification: { title: 'Spartan-G', body: message.notification.body },
    data: { title: 'Spartan-G', message: message.notification.body, body: JSON.stringify(envelope) },
    android: { ...wire.android, priority: envelope.category === 'assessment' || envelope.category === 'system' ? 'normal' as const : 'high' as const },
  };
}

export function createFirebasePushStore(db: Firestore): PushStore {
  return {
    async get(path) { return (await db.doc(path).get()).data() ?? null; },
    transaction(fn) { return db.runTransaction(tx => fn({
      async get(path) { return (await tx.get(db.doc(path))).data() ?? null; },
      set(path, data) {
        if (!/^notification_(?:devices|token_owners|challenges|events|deliveries|rate_limits)\/[A-Za-z0-9_-]{1,256}$/.test(path)) throw Error('Notification metadata write required');
        tx.set(db.doc(path), { ...data, ...(Number.isSafeInteger(data.expiresAt) ? { expireAt: Timestamp.fromMillis(data.expiresAt) } : {}) });
      },
    })); },
    async bindings(uid) { return (await db.collection('notification_devices').where('uid', '==', uid).limit(101).get()).docs.map(d => d.data()); },
  };
}

export function createFirebaseNotificationRuntime(options: {
  enabled: boolean; project: SupportProject; db: Firestore; auth: Auth; messaging: Messaging;
  policy?: { allow(uid: string): Promise<boolean>; permitSend(uid: string, kind: 'proof' | 'visible'): Promise<boolean> };
  delivery?: { send(message: PreparedFcmMessage, attempt: SendAttempt, signal?: AbortSignal): Promise<void> };
  signal?: AbortSignal;
}) {
  const { db, auth, messaging, project } = options;
  if (auth.app.options.projectId !== project || messaging.app !== auth.app || db !== getFirestore(auth.app, '(default)') || db.databaseId !== '(default)') throw Error('Notification Admin project mismatch');
  const store = createFirebasePushStore(db);
  const verifyStudent = createStudentVerifier(project, { authProject: auth.app.options.projectId!, firestoreProject: project,
    verifyIdToken: (token, revoked) => auth.verifyIdToken(token, revoked), getUser: uid => auth.getUser(uid), getUserDocument: uid => store.get(`users/${uid}`),
  });
  return createNotificationBackend({ enabled: options.enabled, project, database: '(default)', store, now: Date.now,
    async accountActive(uid) { try { return !(await auth.getUser(uid)).disabled; } catch { return false; } },
    async verifyStudent(token) { const actor = await verifyStudent(token); if (options.policy && !await options.policy.allow(actor.uid)) throw Error('Staging recipient unavailable'); return actor; },
    permitSend: options.policy?.permitSend,
    allowSend: options.policy?.allow,
    consume: uid => store.transaction(async tx => {
      const minute = Math.floor(Date.now() / 60000), day = Math.floor(Date.now() / 86400000), owner = createHash('sha256').update(uid).digest('hex');
      const paths = [`notification_rate_limits/${owner}_${minute}`, `notification_rate_limits/global_${day}`];
      const rows = await Promise.all(paths.map(p => tx.get(p)));
      if ((rows[0]?.count ?? 0) >= 20 || (rows[1]?.count ?? 0) >= 10000) return false;
      paths.forEach((p, i) => tx.set(p, { count: (rows[i]?.count ?? 0) + 1, expiresAt: (day + 2) * 86400000 })); return true;
    }),
    async challenge(token, data, authorize, uid) {
      if (!options.delivery) throw Error('Notification transport unavailable');
      await options.delivery.send({ token, data: { spartanRegistration: '1', ...data }, android: { ttl: 300000, priority: 'normal' } },
        { id: 'proof_' + data.challengeId, kind: 'proof', uid, authorize }, options.signal);
    },
    async send(message, authorize, uid) {
      if (!options.delivery) throw Error('Notification transport unavailable');
      await options.delivery.send(expoCompatibleFcmMessage(message),
        { id: 'visible_' + createHash('sha256').update(message.data.eventId + ':' + message.data.bindingId).digest('hex'), kind: 'visible', uid, authorize }, options.signal);
    },
  });
}

/** Firebase/Express-compatible adapter; no listener or function export is installed. */
export function createNotificationRequestHandler(runtime: ReturnType<typeof createFirebaseNotificationRuntime>) {
  return async (request: { method: string; path: string; headers: Record<string, string | string[] | undefined>; rawBody: Buffer }, response: { status(code: number): void; set(headers: Record<string, string>): void; json(body: unknown): void }) => {
    const reply = (status: number, body: unknown = {}) => { response.status(status); response.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.json(body); };
    if (request.method !== 'POST') { reply(405); return; }
    const operation = request.path.match(/^\/api\/notifications\/(begin|complete|revoke|preferences|resolve)$/)?.[1];
    if (!operation) { reply(404); return; }
    if (!Buffer.isBuffer(request.rawBody) || request.rawBody.length > 8192) { reply(413); return; }
    if (typeof request.headers['content-type'] !== 'string' || !/^application\/json(?:;|$)/i.test(request.headers['content-type'])) { reply(415); return; }
    let body: unknown; try { body = JSON.parse(request.rawBody.toString('utf8')); } catch { reply(400); return; }
    try {
      const result = await runtime.handle({ method: request.method, path: operation, authorization: typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined, body }); reply(result.status, result.body);
    } catch { reply(503, { error: 'notification-service-unavailable' }); }
  };
}

/** Optional page source for a future trusted publication worker; no scan at import. */
export function createPreparedAssessmentAudience(db: Firestore) {
  const audience = createPreparedNotificationAudience(db);
  return async (assessmentId: string, cursor?: string) => audience('assessments', assessmentId, cursor);
}

/** Server metadata discovery only. Core canonical authorization is still mandatory
 * per recipient before enqueue, before claim and immediately before transmission. */
export function createPreparedNotificationAudience(db: Firestore) {
  return async (collection: 'assessments' | 'announcements', documentId: string, cursor?: string) => {
    if (!['assessments', 'announcements'].includes(collection) || !/^[A-Za-z0-9_-]{1,128}$/.test(documentId)) throw Error('Invalid notification audience source');
    if (cursor && !/^[a-f0-9]{64}$/.test(cursor)) throw Error('Invalid audience cursor');
    let query = db.collection('notification_devices').where('active', '==', true).orderBy(FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    const uids = [...new Set(page.docs.map(d => d.data()).filter(b => b.expiresAt > Date.now() && b.preferences?.phoneEnabled === true && (collection === 'announcements' || b.preferences?.assessmentUpdates === true)).map(b => b.uid as string))];
    return { uids, next: page.size === 100 ? page.docs[page.size - 1].id : null };
  };
}
