import {
  getFirestore,
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
} from 'firebase/firestore';

import { getFirebaseApp } from './app';

let db: Firestore;

export function getFirestoreDb(): Firestore {
  if (!db) {
    const app = getFirebaseApp();
    try {
      // React Native does not provide browser IndexedDB, and Android can
      // time out on Firestore's WebChannel transport. Long polling keeps the
      // existing repository API reliable without changing backend behavior.
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
        useFetchStreams: false,
        localCache: memoryLocalCache(),
      });
    } catch {
      // Preserve compatibility if another module initialized Firestore first.
      db = getFirestore(app);
    }
  }
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