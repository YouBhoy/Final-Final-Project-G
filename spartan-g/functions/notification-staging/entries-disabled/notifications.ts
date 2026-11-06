import { validateHost, type HostContext } from '../isolation';
export const config = { path: '/api/notifications/:operation' } as const;
/** No Firebase, transport, credentials or scheduler. Complete cleanup BEFORE restoring this release. */
export default async function handler(request: Request, context: HostContext) {
  try {
    validateHost(process.env, context, new URL(request.url).hostname);
    return Response.json({ error: 'notification-backend-disabled' }, { status: request.method === 'POST' ? 503 : 405, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({}, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
