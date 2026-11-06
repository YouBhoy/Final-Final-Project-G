import { validRoute, type PushRoute } from './tap-coordinator';
import type { PushEnvelope } from '@spartan-g/shared-services/src/notifications/push-contract';
/** Not constructed in production. An exact separately approved origin is mandatory. */
export function createNotificationHttpClient(ports: {
  origin: string; approvedOrigin: string; apiPrefix?: string; project: 'spartan-g-a2d80' | 'spartan-g-assessment-staging';
  authProject(): string; idToken(): Promise<string>; fetch: typeof fetch; timeoutMs?: number;
}) {
  const origin = new URL(ports.origin);
  if (origin.protocol !== 'https:' || origin.origin !== ports.approvedOrigin || origin.origin !== ports.origin || origin.username || origin.password) throw Error('Approved notification origin required');
  const prefix = ports.apiPrefix ?? '';
  // Firebase's function URL has a path component; never accept arbitrary paths,
  // alternate projects, redirects or a credential-bearing URL from configuration.
  if (prefix !== '' && (prefix !== '/notificationDeviceApi' || ports.project !== 'spartan-g-assessment-staging'
    || origin.origin !== 'https://asia-southeast1-spartan-g-assessment-staging.cloudfunctions.net')) throw Error('Approved notification API path required');
  const request = async (operation: 'begin' | 'complete' | 'revoke' | 'preferences' | 'resolve', body: Record<string, unknown>) => {
    if (ports.authProject() !== ports.project) throw Error('Notification project mismatch');
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('Notification request timed out')); }, ports.timeoutMs ?? 10000); });
    try {
      return await Promise.race([timeout, (async () => {
      const authorization: Record<string, string> = operation === 'revoke' ? {} : { Authorization: `Bearer ${await ports.idToken()}` };
      if (controller.signal.aborted || ports.authProject() !== ports.project) throw Error('Notification request expired');
      const response = await ports.fetch(`${origin.origin}${prefix}/api/notifications/${operation}`, { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...authorization }, body: JSON.stringify(body) });
      if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('application/json')) throw Error('Notification service unavailable');
      const text = await response.text(); if (text.length > 8192) throw Error('Notification response rejected');
      const data: unknown = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Notification response rejected');
      return data as Record<string, unknown>;
      })()]);
    } finally { if (timer) clearTimeout(timer); }
  };
  return { request, async resolve(envelope: PushEnvelope) {
    const data = await request('resolve', { envelope });
    if (Object.keys(data).sort().join(',') !== 'bindingId,category,eventId,route' || data.eventId !== envelope.eventId || data.bindingId !== envelope.bindingId || data.category !== envelope.category || !validRoute(envelope.category, data.route as PushRoute)) throw Error('Notification destination unavailable');
    return { eventId: envelope.eventId, bindingId: envelope.bindingId, category: envelope.category, route: data.route as PushRoute };
  } };
}
