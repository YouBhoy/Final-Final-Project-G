// Source-controlled approval gate. No environment variable can activate this route.
// Console configuration and genuine Android attestation are verified.
// Live requests, release AI activation and another APK build still require approval.
export interface AiLogicReleaseConfig {
  enabled: boolean;
  dataMode: 'synthetic-only';
  projectId: 'spartan-g-a2d80';
  androidAppId: string;
  syntheticAccountUids: readonly string[];
  syntheticAttemptIds: readonly string[];
}

export const aiLogicReleaseConfig: Readonly<AiLogicReleaseConfig> = Object.freeze({
  enabled: false,
  dataMode: 'synthetic-only',
  projectId: 'spartan-g-a2d80',
  androidAppId: '1:250999113503:android:e2cc2c39b6b16decacd22a',
  syntheticAccountUids: Object.freeze([] as string[]),
  syntheticAttemptIds: Object.freeze([] as string[]),
});

/** Validate the dormant route without reading environment flags or initializing Firebase. */
export function isAiLogicReleaseEnabled(config: Readonly<AiLogicReleaseConfig> = aiLogicReleaseConfig): boolean {
  const validIds = (ids: readonly string[]) => Array.isArray(ids)
    && ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 128 && !id.includes('/'))
    && new Set(ids).size === ids.length;
  return config?.enabled === true && config.dataMode === 'synthetic-only'
    && config.projectId === 'spartan-g-a2d80'
    && config.androidAppId === '1:250999113503:android:e2cc2c39b6b16decacd22a'
    && validIds(config.syntheticAccountUids) && config.syntheticAccountUids.length > 0
    && validIds(config.syntheticAttemptIds);
}
