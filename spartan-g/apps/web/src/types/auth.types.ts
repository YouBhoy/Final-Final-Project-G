export type Role = "student" | "facilitator" | "super_admin";

export const ROLES: Record<Uppercase<Role>, Role> = {
  STUDENT: "student",
  FACILITATOR: "facilitator",
  SUPER_ADMIN: "super_admin",
} as const;

export const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  facilitator: "Facilitator",
  super_admin: "Super Admin",
};

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  isActive: boolean;
}

export interface RegisterFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role?: Role;
}

export interface LoginFormData {
  email: string;
  password: string;
}

export interface UserDocument {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: ReturnType<typeof import("firebase/firestore").serverTimestamp>;
  updatedAt: ReturnType<typeof import("firebase/firestore").serverTimestamp>;
}

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";