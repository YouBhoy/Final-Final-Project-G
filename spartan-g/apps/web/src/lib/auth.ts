import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
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
  const { user } = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(user, {
    displayName: `${firstName} ${lastName}`,
  });

  const userDoc: Omit<UserDocument, "createdAt" | "updatedAt"> = {
    uid: user.uid,
    firstName,
    lastName,
    email: user.email!,
    role,
    isActive: true,
  };

  await setDoc(doc(db, "users", user.uid), {
    ...userDoc,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role,
    isActive: true,
  };
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