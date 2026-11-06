import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { Compute } from 'google-auth-library';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { createFirebaseNotificationRuntime, createFirebasePushStore, createNotificationRequestHandler, createPreparedNotificationAudience } from '../notification-preparation/runtime';
import { createAutomaticNotificationEvents } from '../notification-preparation/automatic-events';
import { createStagingControl } from '../notification-staging/control';
import { createStagingFcmSender } from '../notification-staging/fcm-transport';
import { createDurableWork } from './durable-work';
import { createFirestoreIntake } from './firestore-events';
import { createReminderPlanner, currentReminder } from './reminders';
import { DATABASE, LIMITS, PROJECT, RELEASE_APPROVED, SERVICE_ACCOUNT } from './policy';

/** No caller/environment flag can activate this preparation. No SDK initialization
 * or credential lookup occurs while RELEASE_APPROVED is false. No exports are
 * registered with Firebase; a separate reviewed bootstrap/config is still required. */
export function prepareManagedStagingBackend() {
  if (!RELEASE_APPROVED || process.env.NOTIFICATIONS_FIREBASE_STAGING_ENABLED !== 'true') return { enabled: false as const };
  return composeManagedBackend();
}

let managedApp: App | undefined;
function composeManagedBackend() {
  // Metadata-only credential for the exact attached account; no ADC file search,
  // cert(), personal refresh token or exported key. Deployment must pin the account.
  if (process.env.GCLOUD_PROJECT !== PROJECT || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIRESTORE_EMULATOR_HOST
    || process.env.GCE_METADATA_HOST || process.env.GCE_METADATA_IP
    || !process.env.K_SERVICE || !process.env.K_REVISION) throw Error('Managed staging runtime required');
  const name = 'spartan-firebase-notifications-staging';
  if (!managedApp && getApps().some(a => a.name === name)) throw Error('Unexpected managed notification app');
  const compute = new Compute({ serviceAccountEmail: SERVICE_ACCOUNT, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const credential = { async getAccessToken() {
    const result = await compute.getAccessToken(), expiry = compute.credentials.expiry_date;
    if (typeof result.token !== 'string' || !Number.isSafeInteger(expiry) || expiry! <= Date.now()) throw Error('Managed credential unavailable');
    return { access_token: result.token, expires_in: Math.floor((expiry! - Date.now()) / 1000) };
  } };
  const app = managedApp ?? initializeApp({ projectId: PROJECT, credential }, name);
  if (app.options.projectId !== PROJECT) throw Error('Managed notification project mismatch');
  managedApp = app;
  const db = getFirestore(app, DATABASE), store = createFirebasePushStore(db), control = createStagingControl(store);
  const auth = getAuth(app), messaging = getMessaging(app), audience = createPreparedNotificationAudience(db);
  const runtimeFor = (signal: AbortSignal) => createFirebaseNotificationRuntime({ enabled: true, project: PROJECT, db, auth, messaging, signal,
    policy: { allow: control.allow, permitSend: control.allow },
    delivery: createStagingFcmSender({ project: PROJECT, store, allow: control.allow, reserveAttempt: control.reserveAttempt,
      getAccessToken: async () => { if (!app.options.credential) throw Error('Managed credential unavailable'); return (await app.options.credential.getAccessToken()).access_token; } }),
  });
  const queue = createDurableWork({ enabled: true, store, now: Date.now, async process(work, cursor, signal) {
    const base = runtimeFor(signal);
    const runtime = { ...base, async deliver(id: string) {
      if (signal.aborted) throw Error('Work stopped');
      const results = await base.deliver(id);
      if (results.includes('unavailable')) throw Error('Delivery requires review');
      return results;
    } };
    if (work.kind === 'reminder') {
      if (await currentReminder(store, work, Date.now()) && !signal.aborted) {
        const event = await runtime.appointmentReminder(work.appointmentId); if (event && !signal.aborted) await runtime.deliver(event);
      }
      return { next: null };
    }
    const events = createAutomaticNotificationEvents({ runtime, now: Date.now,
      verifyChange: async () => !signal.aborted, // Only normalized server-owned work reaches this private worker.
      audience: async (collection, document, next) => { if (signal.aborted) throw Error('Work stopped'); return audience(collection, document, next); },
    });
    const result = await events.changed(work.change, cursor ?? undefined);
    return { next: result.next };
  } });
  const plan = createReminderPlanner({ enabled: true, store, now: Date.now, enqueue: queue.enqueue });
  const intake = createFirestoreIntake({ enabled: true, now: Date.now, async enqueue(change) {
    await queue.change(change);
    if (change.collection === 'appointments') await plan(change.documentId);
  } });
  return { enabled: true as const, intake, runWork: queue.run,
    request: (signal?: AbortSignal) => async (...args: Parameters<ReturnType<typeof createNotificationRequestHandler>>) => {
      const controller = new AbortController(), stop = () => controller.abort();
      const timer = setTimeout(stop, LIMITS.workDeadlineMs);
      signal?.addEventListener('abort', stop, { once: true });
      if (signal?.aborted) stop();
      try { await createNotificationRequestHandler(runtimeFor(controller.signal))(...args); }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); controller.abort(); }
    },
    /** Fresh bounded page each tick; unfinished jobs retain pending state. Requires
     * an independently reviewed composite index, not an unbounded scan. */
    async dueWorkKeys() {
      const page = await db.collection('notification_rate_limits').where('kind', '==', 'firebase-work-v1')
        .where('state', '==', 'pending').where('dueAt', '<=', Date.now()).orderBy('dueAt').orderBy(FieldPath.documentId()).limit(LIMITS.maxDuePage).get();
      return page.docs.map(d => d.id.replace(/^firebase_work_/, ''));
    },
  };
}
