import { readBody, stagingRuntime, validateHost, type HostContext } from '../host';
export const config = { path: '/api/notifications/:operation' } as const;
export default async function handler(request: Request, context: HostContext) {
  const reply = (status: number, body: unknown = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  try {
    validateHost(process.env, context, new URL(request.url).hostname);
    if (request.method !== 'POST') return reply(405);
    const operation = new URL(request.url).pathname.match(/^\/api\/notifications\/(begin|complete|revoke|preferences|resolve)$/)?.[1];
    if (!operation) return reply(404);
    // Even while paused, exact-capability revocation must remain available after installation.
    if (process.env.NOTIFICATIONS_STAGING_ENABLED !== 'true' && operation !== 'revoke') return reply(503, { error: 'notification-backend-disabled' });
    if (request.headers.has('origin')) return reply(403); // Native-only integration; no browser send API.
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return reply(415);
    let body: unknown; try { body = await readBody(request); } catch { return reply(400); }
    const { runtime } = stagingRuntime(process.env, context, new URL(request.url).hostname, request.signal);
    const result = await runtime.handle({ method: 'POST', path: operation, authorization: request.headers.get('authorization') ?? undefined, body });
    return reply(result.status, result.body);
  } catch { return reply(503, { error: 'notification-service-unavailable' }); }
}
