import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { randomUUID } from 'node:crypto';
import { createFirebaseNotificationRuntime, createFirebasePushStore } from '../notification-preparation/runtime';
import { PROJECT, createStagingControl } from './control';
import { createStagingPoller } from './poller';
import { validateHost, type HostContext } from './isolation';
import { createStagingFcmSender } from './fcm-transport';
export { validateHost, type HostContext } from './isolation';

type Environment = Record<string, string | undefined>;
export function validateCredential(value: unknown) {
  const c = value as Record<string, any>;
  if (!c || c.type !== 'service_account' || c.project_id !== PROJECT
    || c.client_email !== `spartan-g-staging-notify@${PROJECT}.iam.gserviceaccount.com`
    || c.token_uri !== 'https://oauth2.googleapis.com/token'
    || typeof c.private_key !== 'string' || !c.private_key.startsWith('-----BEGIN PRIVATE KEY-----')) throw Error('Notification staging credential rejected');
  return c;
}
export function stagingRuntime(env: Environment, context: HostContext, hostname?: string, signal?: AbortSignal) {
  validateHost(env, context, hostname);
  const credential = validateCredential(JSON.parse(env.NOTIFICATION_STAGING_SERVICE_ACCOUNT_JSON ?? 'null'));
  const name = 'spartan-notifications-staging';
  const existing = getApps().find(a => a.name === name);
  if (existing && existing.options.projectId !== PROJECT) throw Error('Notification app mismatch');
  const app = existing ?? initializeApp({ projectId: PROJECT, credential: cert(credential as any) }, name);
  const db = getFirestore(app, '(default)'), store = createFirebasePushStore(db), policy = createStagingControl(store);
  const delivery = createStagingFcmSender({ project: PROJECT, store, reserveAttempt: policy.reserveAttempt, allow: policy.allow, getAccessToken: async () => {
    if (!app.options.credential) throw Error('Missing notification credential');
    return (await app.options.credential.getAccessToken()).access_token;
  } });
  // Precheck only here. The transport atomically records/debits each actual attempt, once.
  const runtime = createFirebaseNotificationRuntime({ enabled: true, project: PROJECT, db, auth: getAuth(app), messaging: getMessaging(app),
    policy: { allow: policy.allow, permitSend: policy.allow }, delivery, signal });
  const poll = createStagingPoller({ store, runtime, allow: policy.allow, now: Date.now, runId: randomUUID,
    async source(path) {
      // Read only event/authorization fields. Never retrieve message text, notes, answers or risk.
      const [snapshot] = await db.getAll(db.doc(path), { fieldMask: ['senderId', 'conversationId', 'studentId', 'facilitatorId', 'status', 'scheduledAt', 'notifyBeforeMinutes', 'isPublished', 'authorId', 'targetRoles', 'isActive', 'acceptedAt', 'rescheduleRequestedAt', 'updatedAt'] });
      if (!snapshot.exists) return null;
      const data = snapshot.data()!;
      if (data.scheduledAt && typeof data.scheduledAt.toMillis === 'function') data.scheduledAt = data.scheduledAt.toMillis();
      for (const field of ['acceptedAt', 'rescheduleRequestedAt', 'updatedAt']) if (data[field] && typeof data[field].toMillis === 'function') data[field] = data[field].toMillis();
      return { version: snapshot.updateTime!.seconds + '_' + snapshot.updateTime!.nanoseconds, data };
    },
  });
  return { runtime, poll };
}

/** Bounded body reader: do not buffer an arbitrarily large native request. */
export async function readBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw Error('Missing request body');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8192) throw Error('Body limit'); chunks.push(value); } }
  finally { await reader.cancel(); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
