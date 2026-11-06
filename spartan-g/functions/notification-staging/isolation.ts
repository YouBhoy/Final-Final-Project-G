/** Public identity constants only. Safe for the immutable, credential-free disabled release. */
export const PROJECT = 'spartan-g-assessment-staging' as const;
export const SITE_ID = '7ce43b26-cd3c-4f27-a9d3-ffe26f25bdbb';
export const HOST = 'spartang-notifications-staging.netlify.app';
export type HostContext = { site: { id?: string }; deploy: { context: string; published: boolean } };
export function validateHost(env: Record<string, string | undefined>, context: HostContext, hostname?: string) {
  if (context.deploy?.context !== 'production' || context.deploy.published !== true
    || env.NOTIFICATION_PROJECT_ID !== PROJECT || env.NOTIFICATION_DATABASE !== '(default)'
    || env.NOTIFICATION_SITE_ID !== SITE_ID || context.site.id !== SITE_ID
    || env.NOTIFICATION_ALLOWED_HOST !== HOST || (hostname !== undefined && hostname !== HOST)) throw Error('Notification staging isolation rejected');
}
