export function validatePilot(value: unknown, profile: string) {
  const p = value as Record<string, unknown>;
  if (!p || Object.keys(p).sort().join(',') !== 'enabled,origin,package,project'
    || p.project !== 'spartan-g-assessment-staging' || p.package !== 'com.spartang.mobile.staging') throw Error('notification_pilot_configuration_invalid');
  if (p.enabled === false && p.origin === null) return null;
  if (p.enabled !== true || profile !== 'staging-v25' || typeof p.origin !== 'string') throw Error('notification_pilot_profile_rejected');
  const u = new URL(p.origin);
  const firebase = p.origin === 'https://asia-southeast1-spartan-g-assessment-staging.cloudfunctions.net';
  if (u.origin !== p.origin || u.protocol !== 'https:' || u.port || u.username || u.password || u.pathname !== '/' || u.search || u.hash
    || (!firebase && !/^[a-z0-9][a-z0-9-]+\.netlify\.app$/.test(u.hostname)) || u.hostname === 'spartang-assessment-staging.netlify.app') throw Error('notification_pilot_origin_rejected');
  return { project: 'spartan-g-assessment-staging' as const, origin: p.origin, ...(firebase ? { apiPrefix: '/notificationDeviceApi' } : {}) };
}
