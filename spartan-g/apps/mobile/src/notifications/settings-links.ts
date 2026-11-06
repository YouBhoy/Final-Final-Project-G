export type DeviceSettingsTarget = { kind: 'app' | 'system' | 'accessibility' } | { kind: 'channel'; channelId: string };
type Extra = { key: string; value: string };

/** Public Android actions only. Fallback occurs on explicit rejection, never timeout. */
export async function launchDeviceSettings(ports: {
  android: boolean; sdk: number; packageId?: string; channelIds: readonly string[];
  active(): boolean; send(action: string, extras?: Extra[]): Promise<void>; appDetails(): Promise<void>;
}, target: DeviceSettingsTarget, mayContinue: () => boolean = () => true) {
  if (!['app', 'system', 'accessibility', 'channel'].includes(target.kind)) throw Error('Unsupported settings destination');
  if (target.kind === 'channel' && !ports.channelIds.includes(target.channelId)) throw Error('Unknown notification channel');
  const active = () => ports.active() && mayContinue();
  if (!active()) return;
  if (!ports.android) return ports.appDetails();
  if (!Number.isInteger(ports.sdk) || ports.sdk < 24) throw Error('Unsupported Android version');
  if (!['com.spartang.mobile', 'com.spartang.mobile.staging'].includes(ports.packageId ?? '')) throw Error('Unknown application identity');
  const appExtras = [{ key: 'android.provider.extra.APP_PACKAGE', value: ports.packageId! }];
  if (target.kind === 'system' || target.kind === 'accessibility') {
    try { await ports.send(target.kind === 'system' ? 'android.settings.SETTINGS' : 'android.settings.ACCESSIBILITY_SETTINGS'); return; }
    catch { if (!active()) return; if (target.kind === 'system') throw Error('System settings unavailable'); }
    await ports.send('android.settings.SETTINGS'); return;
  }
  if (target.kind === 'channel' && ports.sdk >= 26) {
    try { await ports.send('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [...appExtras, { key: 'android.provider.extra.CHANNEL_ID', value: target.channelId }]); return; }
    catch { if (!active()) return; }
  }
  if (ports.sdk >= 26) {
    try { await ports.send('android.settings.APP_NOTIFICATION_SETTINGS', appExtras); return; }
    catch { if (!active()) return; }
  }
  if (active()) await ports.appDetails();
}
