import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { useAuthStore } from '@spartan-g/shared-services';
import { currentLockActor } from '../security/app-lock';
import { createPhonePreferenceStore } from './phone-preferences-core';

export const phonePreferences = createPhonePreferenceStore(AsyncStorage);
export const currentPhoneOwner = () => currentLockActor()?.owner ?? null;
const sync = () => { void phonePreferences.activate(currentPhoneOwner()); };
const stop = useAuthStore.subscribe(sync);
const hot = (module as unknown as { hot?: { dispose(fn: () => void): void } }).hot;
hot?.dispose(stop);
sync();
export const usePhonePreferences = () => useSyncExternalStore(phonePreferences.subscribe, phonePreferences.getSnapshot, phonePreferences.getSnapshot);
