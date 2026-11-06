/** Native calls are injected so permission tests never prompt a real device or register a token. */
export function createPermissionPreparation(ports: {
  android: boolean; sdk?: number; permission(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  legacyChannelBlocked(): Promise<boolean>; channels(): Promise<void>;
  request(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  active?(): boolean; explain?(): Promise<boolean>;
}) {
  let running: Promise<'granted' | 'denied' | 'blocked' | 'unavailable'> | null = null;
  return () => running ??= (async () => {
    try {
      if (!ports.android) return 'unavailable' as const;
      if (ports.active && !ports.active()) return 'unavailable' as const;
      const permission = await ports.permission();
      if (await ports.legacyChannelBlocked()) return 'blocked' as const;
      if (!permission.granted && !permission.canAskAgain) return 'blocked' as const;
      if (!permission.granted && ports.explain && !await ports.explain()) return 'denied' as const;
      if (ports.active && !ports.active()) return 'unavailable' as const;
      await ports.channels();
      if (ports.active && !ports.active()) return 'unavailable' as const;
      // Before Android 13 there is no POST_NOTIFICATIONS runtime dialog.
      const result = permission.granted || (ports.sdk !== undefined && ports.sdk < 33) ? await ports.permission() : await ports.request();
      return result.granted ? 'granted' as const : result.canAskAgain ? 'denied' as const : 'blocked' as const;
    } catch { return 'unavailable' as const; }
    finally { running = null; }
  })();
}
