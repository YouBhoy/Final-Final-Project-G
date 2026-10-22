import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  updateProfile,
} from "firebase/auth";
import { doc, getDocFromServer, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import type { Role, AuthSession, Campus } from "@spartan-g/shared-types";
import { beginAdminTabSession, clearAdminTabSession, hasAdminTabSession } from './adminTabSession';

let interactiveLogin = false;

/**
 * Firebase Authentication implementation.
 * Uses Firebase Auth for authentication, Firestore for profile data only.
 */

export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: Role = "student",
  campus?: Campus
): Promise<AuthSession> {
  if (role !== "student") {
    throw new Error("Public registration is available to students only. Contact an administrator for a staff account.");
  }
  if (!campus) {
    throw new Error("Campus is required for registration");
  }

  // Create Firebase Auth user
  await setPersistence(auth, browserLocalPersistence);
  const { user } = await createUserWithEmailAndPassword(auth, email, password);

  // Set display name in Firebase Auth
  await updateProfile(user, { displayName: `${firstName} ${lastName}` });

  // Create user profile in Firestore
  const userDoc = {
    uid: user.uid,
    email,
    displayName: `${firstName} ${lastName}`,
    role,
    campus,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

      await setDoc(doc(db, "users", user.uid), userDoc);

  // Create a profile document so profile updates (which use updateDoc) succeed.
  // Mirrors shared auth.service.register() which creates both docs.
  await setDoc(doc(db, "profiles", user.uid), {
    uid: user.uid,
    campus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    role,
    displayName: userDoc.displayName,
    campus,
  };
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthSession> {
  interactiveLogin = true;
  clearAdminTabSession();
  try {
    // Keep credentials out of shared persistent storage until the server confirms the role.
    await setPersistence(auth, inMemoryPersistence);
    const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);

    // Get user profile from Firestore
    const userDoc = await getDocFromServer(doc(db, "users", user.uid));

    if (!userDoc.exists()) {
      throw new Error("User profile not found");
    }

    const userData = userDoc.data();

    if (userData.isActive !== true) {
      throw new Error("Account is deactivated");
    }
    if (!['student', 'facilitator', 'super_admin'].includes(userData.role)) {
      throw new Error("Account role is invalid");
    }

    if (userData.role === 'super_admin') {
      beginAdminTabSession(user.uid);
      await setPersistence(auth, browserSessionPersistence);
    } else {
      await setPersistence(auth, browserLocalPersistence);
    }

    return {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      role: userData.role,
      displayName: user.displayName ?? userData.displayName,
      campus: userData.campus ?? null,
    };
  } catch (error) {
    clearAdminTabSession();
    await signOut(auth).catch(() => undefined);
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes((error as { code?: string })?.code ?? '')) {
      throw new Error('Email or password is incorrect. Check your details or use Forgot password to reset it.');
    }
    throw error;
  } finally {
    interactiveLogin = false;
  }
}

export async function logoutUser(): Promise<void> {
  clearAdminTabSession();
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export function onAuthChange(
  callback: (user: AuthSession | null) => void
): () => void {
  let stopProfile: (() => void) | undefined;
  let generation = 0;
  let stopped = false;
  const stopAuth = onAuthStateChanged(auth, (firebaseUser) => {
    const current = ++generation;
    stopProfile?.();
    stopProfile = undefined;
    // Never carry a previous account's privileges across an account switch.
    callback(null);
    if (!firebaseUser || stopped) return;
    const isCurrent = () => !stopped && current === generation && auth.currentUser?.uid === firebaseUser.uid;
    stopProfile = onSnapshot(doc(db, "users", firebaseUser.uid), { includeMetadataChanges: true }, snapshot => {
      if (!isCurrent()) return;
      if (interactiveLogin) return;
      // Local cache entries and optimistic client edits are not authorization.
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || !snapshot.exists()) {
        callback(null);
        return;
      }
      const data = snapshot.data();
      if (data.isActive !== true || !['student', 'facilitator', 'super_admin'].includes(data.role)) {
        callback(null);
        return;
      }
      if (data.role === 'super_admin' && !hasAdminTabSession(firebaseUser.uid)) {
        // Reject legacy persistent sessions and expired tab sessions before mounting the portal.
        clearAdminTabSession();
        callback(null);
        void signOut(auth).catch(() => undefined);
        return;
      }
      callback({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        emailVerified: firebaseUser.emailVerified,
        role: data.role,
        displayName: firebaseUser.displayName ?? data.displayName,
        campus: data.campus ?? null,
      });
    }, () => {
      if (isCurrent()) callback(null);
    });
  });
  return () => {
    stopped = true;
    generation++;
    stopProfile?.();
    stopAuth();
  };
}

export function getRoleRedirect(role: Role): string {
  const routes: Record<Role, string> = {
    student: "/student/dashboard",
    facilitator: "/facilitator/dashboard",
    super_admin: "/admin/dashboard",
  };
  return routes[role];
}
