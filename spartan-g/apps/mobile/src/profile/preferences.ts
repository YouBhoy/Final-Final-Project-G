import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { useAuthStore } from '@spartan-g/shared-services';
import { createPreferenceStore, preferenceOwner } from './preferences-core';

export const profilePreferences = createPreferenceStore(AsyncStorage);
export function currentPreferenceOwner() {
  const auth = useAuthStore.getState();
  return auth.status === 'authenticated' ? preferenceOwner(auth.session) : null;
}
const synchronize = () => { void profilePreferences.activate(currentPreferenceOwner()); };
// Store subscription survives screen navigation. Generation checks reject late account-A reads/writes.
const unsubscribe = useAuthStore.subscribe(synchronize);
const hot = (module as unknown as { hot?: { dispose(cleanup: () => void): void } }).hot;
hot?.dispose(unsubscribe);
synchronize();
export const useProfilePreferences = () => useSyncExternalStore(profilePreferences.subscribe, profilePreferences.getSnapshot, profilePreferences.getSnapshot);
