import { initializeApp, getApps, FirebaseApp } from 'firebase/app';

import { env } from '@/config';

let app: FirebaseApp;

export function getFirebaseApp(): FirebaseApp {
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
