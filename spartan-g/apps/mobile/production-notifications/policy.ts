export const PRODUCTION_NOTIFICATION_ORIGIN = 'https://spartang-notification-api-production.netlify.app';

export function validateProductionNotifications(value: unknown, versionCode: number) {
  const p = value as Record<string, unknown>;
  if (!p || Object.keys(p).sort().join(',') !== 'enabled,origin,package,project,siteId,versionCode'
    || p.project !== 'spartan-g-a2d80' || p.package !== 'com.spartang.mobile' || p.versionCode !== 34
    || versionCode !== 34 || p.origin !== PRODUCTION_NOTIFICATION_ORIGIN) throw Error('Production notification plan rejected');
  // Pin the intended origin even in a disabled release. This is not proof that
  // the site exists or is approved; activation still requires its verified ID.
  if (p.enabled === false && p.siteId === null) return null;
  if (p.enabled !== true
    || p.siteId !== '904e63f2-60ad-43fb-af99-0490c2d75f2d'
    || ['5c733134-542b-4713-a3d9-d8f41394b03a', '7ce43b26-cd3c-4f27-a9d3-ffe26f25bdbb'].includes(p.siteId)) throw Error('Production notification binding unapproved');
  return { project: 'spartan-g-a2d80' as const, origin: p.origin };
}
