import { useEffect, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { PLATFORMS } from '@spartan-g/shared-types';
import {
  useAuthStore,
  setMessagingAdapter,
} from '@spartan-g/shared-services';
import { expoMessagingAdapter } from '../adapters/expo-messaging.adapter';
import { NotificationCoordinator } from '../notifications/NotificationCoordinator';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const setPlatform = useAuthStore((s) => s.setPlatform);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    setMessagingAdapter(expoMessagingAdapter);
    setPlatform(PLATFORMS.MOBILE);
    const unsubscribe = initialize();
    return unsubscribe;
  }, [setPlatform, initialize]);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <NotificationCoordinator />
      {children}
    </SafeAreaProvider>
  );
}
