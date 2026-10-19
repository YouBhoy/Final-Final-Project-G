import {
  connectAuthEmulator,
  Auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from 'firebase/auth';

import { getFirebaseApp } from './app';
import { getPlatformAuth } from './auth-platform';
import { localEmulators } from '../config/local-emulators';
import { assertLocalEmulatorsReady } from './local-emulator-state';

export function getFirebaseAuth(): Auth {
  assertLocalEmulatorsReady();
  const auth = getPlatformAuth(getFirebaseApp());
  if (localEmulators.enabled) {
    if (!auth.emulatorConfig) {
      connectAuthEmulator(auth, `http://${localEmulators.host}:${localEmulators.authPort}`, { disableWarnings: true });
    }
  }
  if (localEmulators.enabled && (auth.app.name !== localEmulators.appName
      || auth.emulatorConfig?.host !== localEmulators.host || auth.emulatorConfig.port !== localEmulators.authPort)) {
    throw new Error('Local Auth isolation failed; cold restart required.');
  }
  return auth;
}

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
};

export type { User };
