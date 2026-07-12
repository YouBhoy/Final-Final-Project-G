import {
  getFirestore,
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
  enableMultiTabIndexedDbPersistence,
  serverTimestamp,
  Timestamp,
  DocumentData,
  QueryConstraint,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';

import { getFirebaseApp } from './app';

let db: Firestore;
let persistencePromise: Promise<void> | null = null;

function ensurePersistence(firestore: Firestore) {
  if (!persistencePromise) {
    persistencePromise = enableMultiTabIndexedDbPersistence(firestore).catch((error) => {
      console.warn('[Firestore] Offline persistence unavailable:', error);
    });
  }

  return persistencePromise;
}

export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
    void ensurePersistence(db);
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