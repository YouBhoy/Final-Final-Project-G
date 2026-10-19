import type { FirebaseApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { env } from '../config/env';
import { localEmulators } from '../config/local-emulators';
import { assertLocalEmulatorsReady } from './local-emulator-state';

type Storage = Pick<typeof import('@react-native-async-storage/async-storage').default,
  'getItem' | 'setItem' | 'removeItem'>;
type NativeAuthSdk = typeof firebaseAuth & {
  getReactNativePersistence(storage: Storage): firebaseAuth.Persistence;
};
type Record = { auth: firebaseAuth.Auth; local: boolean; storageFailed: boolean };
type AuthGlobals = typeof globalThis & {
  __spartanNativeAuthV1?: WeakMap<FirebaseApp, Record>;
};

const globals = globalThis as AuthGlobals;
const instances = globals.__spartanNativeAuthV1 ??= new WeakMap<FirebaseApp, Record>();
const storageError = 'Firebase Auth storage is unavailable. Restart the app after resolving storage access; persistent sign-in cannot be guaranteed.';

function hasNativePersistence(sdk: typeof firebaseAuth): sdk is NativeAuthSdk {
  // Firebase 11.10's RN runtime exports this public API; its generic declarations omit it.
  return 'getReactNativePersistence' in sdk && typeof sdk.getReactNativePersistence === 'function';
}

export function getPlatformAuth(app: FirebaseApp): firebaseAuth.Auth {
  assertLocalEmulatorsReady();
  const local = localEmulators.enabled;
  if (app.options.projectId !== env.firebase.projectId
      || (local && app.name !== localEmulators.appName)
      || (!local && app.name !== '[DEFAULT]')) {
    throw new Error('Firebase Auth app configuration mismatch; cold restart required.');
  }

  const existing = instances.get(app);
  if (existing) {
    if (existing.local !== local) throw new Error('Firebase Auth mode changed; cold restart required.');
    if (existing.storageFailed) throw new Error(storageError);
    return existing.auth;
  }

  let storageFailed = false;
  let record: Record | undefined;
  let persistence: firebaseAuth.Persistence = firebaseAuth.inMemoryPersistence;
  if (!local) {
    if (!hasNativePersistence(firebaseAuth)) throw new Error('Firebase React Native persistence API is unavailable.');
    let storage: Storage;
    try {
      // Keep explicit local emulator mode usable without loading the native storage module.
      storage = (require('@react-native-async-storage/async-storage') as
        typeof import('@react-native-async-storage/async-storage')).default;
      if (!storage?.getItem || !storage.setItem || !storage.removeItem) throw new Error('Unavailable');
    } catch {
      throw new Error('Native Auth storage module is unavailable. An approved Android rebuild is required; do not clear application data.');
    }
    const fail = (): never => {
      storageFailed = true;
      if (record) record.storageFailed = true;
      throw new Error(storageError);
    };
    let readable: Promise<string | null> | undefined;
    const assertReadable = () => readable ??= storage.getItem('@spartan-g/auth-storage-probe').catch(fail);
    // The SDK owns all session serialization. Only observe storage failures, never token values.
    // Check read access before the SDK's write-only availability probe can select this storage.
    const guardedStorage: Storage = {
      async getItem(key) { try { await assertReadable(); return await storage.getItem(key); } catch { return fail(); } },
      async setItem(key, value) { try { await assertReadable(); await storage.setItem(key, value); } catch { fail(); } },
      async removeItem(key) { try { await assertReadable(); await storage.removeItem(key); } catch { fail(); } },
    };
    persistence = firebaseAuth.getReactNativePersistence(guardedStorage);
  }

  let auth: firebaseAuth.Auth;
  try {
    auth = firebaseAuth.initializeAuth(app, { persistence });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error
        && error.code === 'auth/already-initialized') {
      throw new Error('Firebase Auth was initialized outside the native persistence adapter. Fully restart the app; existing data was not cleared.');
    }
    throw error;
  }
  record = { auth, local, storageFailed };
  if (!local) {
    // The SDK can internally fall back to memory when its storage probe fails.
    // Block subsequent sign-in/state changes instead of promising a persistent session.
    firebaseAuth.beforeAuthStateChanged(auth, (user) => {
      if (user && storageFailed) throw new Error(storageError);
    });
  }
  instances.set(app, record);
  return auth;
}
