import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { env } from '../config/env';
import { localEmulators } from '../config/local-emulators';
import { assertLocalEmulatorsReady } from './local-emulator-state';

let app: FirebaseApp;

export function getFirebaseApp(): FirebaseApp {
  if (localEmulators.enabled) {
    const local = localEmulators;
    assertLocalEmulatorsReady();
    if (env.firebase.projectId !== localEmulators.projectId) throw new Error('Local Firebase project mismatch.');
    const existing = getApps().find(candidate => candidate.name === local.appName);
    if (existing && existing.options.projectId !== localEmulators.projectId) throw new Error('Local Firebase app mismatch.');
    return existing ?? initializeApp(env.firebase, localEmulators.appName);
  }
  if (!getApps().length) {
    app = initializeApp({
      apiKey: env.firebase.apiKey,
      authDomain: env.firebase.authDomain,
      projectId: env.firebase.projectId,
      storageBucket: env.firebase.storageBucket,
      messagingSenderId: env.firebase.messagingSenderId,
      appId: env.firebase.appId,
      measurementId: env.firebase.measurementId,
    });
  } else {
    app = getApps()[0]!;
  }
  return app;
}
