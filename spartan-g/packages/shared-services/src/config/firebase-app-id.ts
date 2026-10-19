// Public Firebase registration identifiers, verified against the existing Android app.
// Auth persistence continues to use the unchanged Firebase API key and app name.
export function resolveNativeFirebaseAppId(platform: string, projectId: string, configuredAppId: string): string {
  if (platform !== 'android') return configuredAppId;
  if (projectId !== 'spartan-g-a2d80') throw new Error('Android Firebase registration project mismatch.');
  // Preserve the existing required-field validation instead of masking missing configuration.
  if (!configuredAppId) return configuredAppId;
  return '1:250999113503:android:e2cc2c39b6b16decacd22a';
}
