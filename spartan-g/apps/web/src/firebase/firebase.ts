import { initializeApp } from "firebase/app";
import { initializeAuth, browserSessionPersistence, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// Restore this tab's session before looking for a different account in shared storage.
// loginUser selects session persistence for admins and local persistence for other roles.
const auth = initializeAuth(app, {
  persistence: [browserSessionPersistence, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
});
const db = getFirestore(app);
const storage = getStorage(app);

// ─── Emulator support (development only) ────────────────────────
if (import.meta.env.VITE_APP_ENV === "development") {
  const useEmulators = import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true";

  if (useEmulators) {
    connectAuthEmulator(auth, "http://localhost:9099");
    connectFirestoreEmulator(db, "localhost", 8080);
    connectStorageEmulator(storage, "localhost", 9199);
    connectFunctionsEmulator(getFunctions(app), "localhost", 5001);
  }
}

export { app, auth, db, storage };
