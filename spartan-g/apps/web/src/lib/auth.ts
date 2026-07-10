import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import type { Role, AuthSession } from "@spartan-g/shared-types";

/**
 * Firebase Authentication implementation.
 * Uses Firebase Auth for authentication, Firestore for profile data only.
 */

export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: Role = "student"
): Promise<AuthSession> {
  // Create Firebase Auth user
  const { user } = await createUserWithEmailAndPassword(auth, email, password);

  // Set display name in Firebase Auth
  await updateProfile(user, { displayName: `${firstName} ${lastName}` });

  // Create user profile in Firestore
  const userDoc = {
    uid: user.uid,
    email,
    displayName: `${firstName} ${lastName}`,
    role,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "users", user.uid), userDoc);

  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    role,
    displayName: userDoc.displayName,
  };
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthSession> {
  // Authenticate with Firebase Auth
  const { user } = await signInWithEmailAndPassword(auth, email, password);

  // Get user profile from Firestore
  const userDoc = await getDoc(doc(db, "users", user.uid));

  if (!userDoc.exists()) {
    throw new Error("User profile not found");
  }

  const userData = userDoc.data();

  if (!userData.isActive) {
    throw new Error("Account is deactivated");
  }

  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    role: userData.role,
    displayName: user.displayName ?? userData.displayName,
  };
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export function onAuthChange(
  callback: (user: AuthSession | null) => void
): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      // Get user profile from Firestore
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

      if (!userDoc.exists()) {
        callback(null);
        return;
      }

      const userData = userDoc.data();

      if (!userData.isActive) {
        callback(null);
        return;
      }

      callback({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        emailVerified: firebaseUser.emailVerified,
        role: userData.role,
        displayName: firebaseUser.displayName ?? userData.displayName,
      });
    } else {
      callback(null);
    }
  });
}

export function getRoleRedirect(role: Role): string {
  const routes: Record<Role, string> = {
    student: "/student/dashboard",
    facilitator: "/facilitator/dashboard",
    super_admin: "/admin/dashboard",
  };
  return routes[role];
}