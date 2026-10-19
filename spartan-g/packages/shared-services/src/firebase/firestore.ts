import {
  getFirestore,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  DocumentData,
  QueryConstraint,
  writeBatch,
  runTransaction,
  type FirestoreSettings,
} from 'firebase/firestore';

import { getFirebaseApp } from './app';
import { localEmulators } from '../config/local-emulators';
import { assertLocalEmulatorsReady } from './local-emulator-state';

// The installed @firebase/firestore 4.8.0 RN runtime reads this legacy option,
// although its public settings type omits it. Retain the existing transport.
type ReactNativeFirestoreSettings = FirestoreSettings & { useFetchStreams: false };

let db: Firestore;

export function getFirestoreDb(): Firestore {
  assertLocalEmulatorsReady();
  if (!db) {
    const app = getFirebaseApp();
    if (localEmulators.enabled) {
      const instance = initializeFirestore(app, {
        experimentalForceLongPolling: true, useFetchStreams: false, localCache: memoryLocalCache(),
      } as ReactNativeFirestoreSettings);
      connectFirestoreEmulator(instance, localEmulators.host, localEmulators.firestorePort);
      db = instance;
      return db;
    }
    try {
      // React Native does not provide browser IndexedDB, and Android can
      // time out on Firestore's WebChannel transport. Long polling keeps the
      // existing repository API reliable without changing backend behavior.
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
        useFetchStreams: false,
        localCache: memoryLocalCache(),
      } as ReactNativeFirestoreSettings);
    } catch {
      // Preserve compatibility if another module initialized Firestore first.
      db = getFirestore(app);
    }
  }
  if (localEmulators.enabled && db.app.name !== localEmulators.appName) throw new Error('Local Firestore isolation failed; cold restart required.');
  return db;
}

export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  runTransaction,
};

export type { DocumentData, QueryConstraint, Unsubscribe } from 'firebase/firestore';
