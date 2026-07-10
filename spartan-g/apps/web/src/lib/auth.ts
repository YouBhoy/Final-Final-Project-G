import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  deleteUser,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import type { Role, AuthUser, UserDocument } from "../types/auth.types";

export async function registerUser(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: Role = "student"
): Promise<AuthUser> {
  let firebaseUser: User | null = null;

  try {
    // Step 1: Create Firebase Auth user
    const result = await createUserWithEmailAndPassword(auth, email, password);
    firebaseUser = result.user;

    // Step 2: Update profile
    await updateProfile(firebaseUser, {
      displayName: `${firstName} ${lastName}`,
    });

    // Step 3: Create Firestore user document
    const userDoc: Omit<UserDocument, "createdAt" | "updatedAt"> = {
      uid: firebaseUser.uid,
      firstName,
      lastName,
      email: firebaseUser.email!,
      role,
      isActive: true,
    };

    await setDoc(doc(db, "users", firebaseUser.uid), {
      ...userDoc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      role,
      isActive: true,
    };
  } catch (error) {
    // If Firestore write failed, clean up the Firebase Auth user
    if (firebaseUser) {
      try {
        await deleteUser(firebaseUser);
      } catch (deleteError) {
        // Log but don't throw - the main error is more important
        console.error("Failed to clean up Firebase Auth user:", deleteError);
      }
    }
    throw error;
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthUser> {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return buildAuthUser(user);
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export function onAuthChange(
  callback: (user: AuthUser | null) => void
): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }

    try {
      const authUser = await buildAuthUser(firebaseUser);
      callback(authUser);
    } catch {
      callback(null);
    }
  });
}

async function buildAuthUser(firebaseUser: User): Promise<AuthUser> {
  const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
  const userData = userDoc.data() as UserDocument | undefined;

  if (!userData || !userData.isActive) {
    await signOut(auth);
    throw new Error("Account is deactivated");
  }

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    role: userData.role,
    isActive: userData.isActive,
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