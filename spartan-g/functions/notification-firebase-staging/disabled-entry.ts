import { onRequest } from 'firebase-functions/v2/https';
import { LIMITS, PROJECT, SERVICE_ACCOUNT } from './policy';

/** Independently deployable DISABLED codebase. No Admin, sender, trigger, device
 * registration or scheduler import. Changing an environment flag cannot activate it.
 * The complete prepared backend is a separate, unreachable package module. */
export const notificationDeviceApi = onRequest({
  region: LIMITS.region, serviceAccount: SERVICE_ACCOUNT, memory: '256MiB',
  cpu: 1, maxInstances: 1, minInstances: 0, concurrency: 1, timeoutSeconds: 10,
  invoker: 'private', cors: false,
}, (_request, response) => {
  response.status(503).set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    .json({ project: PROJECT, error: 'notification-backend-disabled', registration: 'disabled', delivery: 'disabled' });
});
