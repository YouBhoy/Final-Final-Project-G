import { stagingRuntime, validateHost, type HostContext } from '../host';
// Netlify does not expose a scheduled function as a public URL. No event payload is trusted.
export const config = { schedule: '* * * * *' } as const;
export default async function handler(_request: Request, context: HostContext) {
  try {
    validateHost(process.env, context);
    if (process.env.NOTIFICATIONS_STAGING_ENABLED !== 'true') return;
    await stagingRuntime(process.env, context, undefined, AbortSignal.timeout(20000)).poll();
  } catch { /* No provider, credential, source or token details in logs. Persisted poll failure blocks recovery. */ }
}
