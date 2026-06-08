import { useEffect, type ReactNode } from 'react';
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

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {children}
    </SafeAreaProvider>
  );
}
