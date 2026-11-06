import { useEffect } from 'react';
import { NotificationCoordinator as ExistingCoordinator } from '../../src/notifications/NotificationCoordinator';
import { phonePreferences } from '../../src/notifications/phone-preferences';
import { acquireNotificationRuntime, releaseNotificationRuntime } from './runtime';
export function NotificationCoordinator() {
  useEffect(() => {
    let disposed = false, stop: (() => void) | undefined;
    let held: Awaited<ReturnType<typeof acquireNotificationRuntime>> = null;
    void acquireNotificationRuntime().then(runtime => {
      if (!runtime) return;
      if (disposed) { void releaseNotificationRuntime(runtime).catch(() => {}); return; }
      held = runtime;
      const sync = () => { void runtime.synchronize().catch(() => {}); };
      stop = phonePreferences.subscribe(sync); sync();
    }).catch(() => {});
    return () => { disposed = true; stop?.(); if (held) void releaseNotificationRuntime(held).catch(() => {}); };
  }, []);
  return <ExistingCoordinator />;
}
