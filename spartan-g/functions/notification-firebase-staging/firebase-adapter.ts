import { createHash } from 'node:crypto';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { ProviderEvent, SourceCollection } from './firestore-events';
import { InvalidFirebaseSourceError } from './firestore-events';
import { prepareManagedStagingBackend } from './managed-preparation';
import { DATABASE, LIMITS, PROJECT, RELEASE_APPROVED, SERVICE_ACCOUNT } from './policy';

/** Not called/exported by any Firebase entry point. Literal source approval is false;
 * calling this factory with stale environment flags still registers nothing. */
export function prepareFirebaseFunctions() {
  if (!RELEASE_APPROVED) return {};
  const common = { region: LIMITS.region, serviceAccount: SERVICE_ACCOUNT, memory: '256MiB' as const, cpu: LIMITS.cpu,
    maxInstances: LIMITS.maxInstances, minInstances: LIMITS.minInstances, concurrency: LIMITS.concurrency, timeoutSeconds: LIMITS.timeoutSeconds };
  const changed = async (collection: SourceCollection, event: ProviderEvent) => {
    const backend = prepareManagedStagingBackend();
    if (!backend.enabled) return;
    try {
      const status = await backend.intake(collection, event);
      if (status === 'recorded') await backend.runWork(createHash('sha256').update(PROJECT + ':event:' + event.id).digest('hex'));
    } catch (error) {
      // Provider retries recover ingestion failures; invalid/expired events are terminal.
      // Durable work/FCM claims ensure this never authorizes replay of an unknown send.
      if (!(error instanceof InvalidFirebaseSourceError)) throw Error('Firebase notification ingestion unavailable');
    }
  };
  return {
    messageCreated: onDocumentCreated({ ...common, database: DATABASE, document: 'messages/{messageId}', retry: true }, event => changed('messages', event)),
    appointmentWritten: onDocumentWritten({ ...common, database: DATABASE, document: 'appointments/{appointmentId}', retry: true }, event => changed('appointments', event)),
    assessmentWritten: onDocumentWritten({ ...common, database: DATABASE, document: 'assessments/{assessmentId}', retry: true }, event => changed('assessments', event)),
    // Future native ingress uses Firebase ID-token verification inside the protocol;
    // a Firebase student token is not a Cloud Run IAM token. Source approval is
    // still false. Granting public invocation later requires separate cloud approval.
    notificationDeviceApi: onRequest({ ...common, invoker: 'public', cors: false }, async (request, response) => {
      const backend = prepareManagedStagingBackend();
      if (!backend.enabled) { response.status(503).set('Cache-Control', 'no-store').json({ error: 'notification-backend-disabled' }); return; }
      const controller = new AbortController();
      const stop = () => controller.abort();
      request.once('aborted', stop); response.once('close', stop);
      try { await backend.request(controller.signal)(request, response); }
      finally { controller.abort(); request.removeListener('aborted', stop); response.removeListener('close', stop); }
    }),
    dueWork: onSchedule({ ...common, schedule: '* * * * *', timeZone: 'Asia/Manila', retryCount: 0 }, async () => {
      const backend = prepareManagedStagingBackend();
      if (!backend.enabled) return;
      const keys = await backend.dueWorkKeys();
      for (const key of keys.slice(0, LIMITS.maxWorkPerTick)) await backend.runWork(key);
    }),
  };
}
