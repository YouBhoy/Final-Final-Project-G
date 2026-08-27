import { useEffect, type ReactNode } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PLATFORMS } from '@spartan-g/shared-types';
import {
  useAuthStore,
  notificationService,
  getDeploymentTargetFromStore,
  setMessagingAdapter,
} from '@spartan-g/shared-services';
import { expoMessagingAdapter } from '../adapters/expo-messaging.adapter';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const setPlatform = useAuthStore((s) => s.setPlatform);
  const initialize = useAuthStore((s) => s.initialize);
  const session = useAuthStore((s) => s.session);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    setMessagingAdapter(expoMessagingAdapter);
    setPlatform(PLATFORMS.MOBILE);
    const unsubscribe = initialize();
    return unsubscribe;
  }, [setPlatform, initialize]);

  useEffect(() => {
    if (status === 'authenticated' && session?.uid) {
      const target = getDeploymentTargetFromStore();
      if (target) {
        notificationService.registerDevice(session.uid, target).catch(() => {});
      }
    }
  }, [status, session?.uid]);

  // ─── Push-notification tap routing ──────────────────────────────
  // Sends carry { url: 'spartan-g://...' } in their data payload; react-navigation's
  // linking config maps those URLs to the same screens as in-app notification taps.
  useEffect(() => {
    let lastHandledUrl: string | null = null;

    const openFromResponse = (data?: Record<string, unknown>) => {
      const url = typeof data?.url === 'string' ? data.url : null;
      if (!url || url === lastHandledUrl) return;
      lastHandledUrl = url;
      Linking.openURL(url).catch(() => {
        /* Unknown/unregistered deep link — ignore */
      });
    };

    // Cold start: app launched by tapping a push notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      openFromResponse(response?.notification.request.content.data as Record<string, unknown>);
    });

    // Warm start: push tapped while the app is already running
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromResponse(response.notification.request.content.data as Record<string, unknown>);
    });

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {children}
    </SafeAreaProvider>
  );
}
