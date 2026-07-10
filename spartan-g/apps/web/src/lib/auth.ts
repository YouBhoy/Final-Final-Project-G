import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, query, where, getDocs, collection } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import type { Role, AuthUser, UserDocument } from "../types/auth.types";

/**
 * Custom authentication using Firestore users collection.
 * Users are stored in Firestore, not Firebase Auth.
 */
export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: Role = "student"
): Promise<AuthUser> {
  // Check if user already exists
  const existingUsers = await getDocs(
    query(collection(db, "users"), where("email", "==", email))
  );
  
  if (!existingUsers.empty) {
    throw new Error("User already exists");
  }

  // Generate a simple ID (in production, use proper ID generation)
  const uid = `user_${Date.now()}`;

  const userDoc: Omit<UserDocument, "createdAt" | "updatedAt"> = {
    uid,
    firstName,
    lastName,
    email,
    role,
    isActive: true,
  };

  await setDoc(doc(db, "users", uid), {
    ...userDoc,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    uid,
    email,
    displayName: `${firstName} ${lastName}`,
    role,
    isActive: true,
  };
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthUser> {
  // Find user by email in Firestore
  const users = await getDocs(
    query(collection(db, "users"), where("email", "==", email))
  );

  if (users.empty) {
    throw new Error("Invalid credentials");
  }

  const userDoc = users.docs[0];
  const userData = userDoc.data() as UserDocument;

  // In a real app, you'd verify the password hash here
  // For now, we just check if the user exists and is active
  if (!userData.isActive) {
    throw new Error("Account is deactivated");
  }

  // Store a simple session token in localStorage
  localStorage.setItem("auth_user", JSON.stringify({
    uid: userData.uid,
    email: userData.email,
    displayName: `${userData.firstName} ${userData.lastName}`,
    role: userData.role,
    isActive: userData.isActive,
  }));

  return {
    uid: userData.uid,
    email: userData.email,
    displayName: `${userData.firstName} ${userData.lastName}`,
    role: userData.role,
    isActive: userData.isActive,
  };
}

export async function logoutUser(): Promise<void> {
  localStorage.removeItem("auth_user");
}

export async function resetPassword(email: string): Promise<void> {
  // In a real app, you'd implement password reset via email
  // For now, this is a no-op since we're using custom auth
  throw new Error("Password reset not implemented for custom auth");
}

export function onAuthChange(
  callback: (user: AuthUser | null) => void
): () => void {
  // Check localStorage for existing session
  const stored = localStorage.getItem("auth_user");
  if (stored) {
    try {
      const user = JSON.parse(stored) as AuthUser;
      callback(user);
    } catch {
      callback(null);
    }
  } else {
    callback(null);
  }

  // Return empty unsubscribe function (no Firebase listener needed)
  return () => {};
}

export function getRoleRedirect(role: Role): string {
  const routes: Record<Role, string> = {
    student: "/student/dashboard",
    facilitator: "/facilitator/dashboard",
    super_admin: "/admin/dashboard",
  };
  return routes[role];
}