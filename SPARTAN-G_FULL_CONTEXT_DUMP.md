# SPARTAN-G — Full Context Dump for AI Assistant (Phase 3B: Assessment Wizard UI)

---

## 1. COMPLETE MONOREPO FILE TREE

```
spartan-g/
├── .gitignore
├── ARCHITECTURE.md
├── firebase.json
├── package-lock.json
├── package.json                        # Root workspace config
├── README.md
├── tsconfig.base.json
├── assets/
│   └── .gitkeep
├── firebase/
│   ├── firestore.indexes.json
│   ├── firestore.rules
│   └── storage.rules
├── apps/
│   ├── mobile/
│   │   ├── app.config.ts
│   │   ├── babel.config.js
│   │   ├── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── adapters/
│   │       │   └── expo-messaging.adapter.ts
│   │       ├── app/
│   │       │   └── App.tsx
│   │       ├── navigation/
│   │       │   ├── AuthNavigator.tsx
│   │       │   ├── FacilitatorNavigator.tsx
│   │       │   ├── linking.ts
│   │       │   ├── RootNavigator.tsx
│   │       │   ├── StudentNavigator.tsx
│   │       │   ├── WebOnlyScreen.tsx
│   │       │   └── placeholders/
│   │       │       └── PlaceholderScreen.tsx
│   │       └── providers/
│   │           └── AppProviders.tsx
│   └── web/
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── vite-env.d.ts
│           ├── adapters/
│           │   └── web-messaging.adapter.ts
│           ├── app/
│           │   └── App.tsx
│           ├── components/
│           │   ├── PlaceholderPage.tsx
│           │   ├── auth/
│           │   │   ├── AuthLayout.tsx
│           │   │   └── ProtectedRoute.tsx
│           │   └── ui/
│           │       ├── Button.tsx
│           │       └── Input.tsx
│           ├── firebase/
│           │   └── firebase.ts
│           ├── hooks/
│           │   └── useAuth.tsx
│           ├── lib/
│           │   └── auth.ts
│           ├── navigation/
│           │   ├── AppRouter.tsx
│           │   ├── AuthRoutes.tsx
│           │   ├── FacilitatorPortalRoutes.tsx
│           │   ├── StudentPortalRoutes.tsx
│           │   └── SuperAdminPortalRoutes.tsx
│           ├── pages/
│           │   ├── DashboardPage.tsx
│           │   ├── ForgotPasswordPage.tsx
│           │   ├── LoginPage.tsx
│           │   └── RegisterPage.tsx
│           ├── providers/
│           │   └── AppProviders.tsx
│           ├── styles/
│           │   └── global.css
│           └── types/
│               └── auth.types.ts
└── packages/
    ├── shared-services/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── config/
    │       │   └── env.ts
    │       ├── firebase/
    │       │   ├── app.ts
    │       │   ├── auth.ts
    │       │   ├── firestore.ts
    │       │   ├── index.ts
    │       │   ├── messaging-adapter.ts
    │       │   └── storage.ts
    │       ├── repositories/
    │       │   ├── appointment.repository.ts
    │       │   ├── base.repository.ts
    │       │   ├── conversation.repository.ts
    │       │   ├── device-token.repository.ts
    │       │   ├── index.ts
    │       │   ├── message.repository.ts
    │       │   ├── profile.repository.ts
    │       │   ├── risk-alert.repository.ts
    │       │   ├── user.repository.ts
    │       │   └── work-hours.repository.ts
    │       ├── services/
    │       │   ├── appointment.service.ts
    │       │   ├── auth.service.ts
    │       │   ├── index.ts
    │       │   ├── messaging.service.ts
    │       │   ├── notification.service.ts
    │       │   ├── risk-alert.service.ts
    │       │   ├── storage.service.ts
    │       │   ├── user.service.ts
    │       │   └── work-hours.service.ts
    │       └── store/
    │           ├── app.store.ts
    │           ├── auth.store.ts
    │           └── index.ts
    ├── shared-types/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── constants/
    │       │   ├── collections.ts
    │       │   ├── firestore-schemas.ts
    │       │   ├── index.ts
    │       │   ├── permissions.ts
    │       │   ├── platforms.ts
    │       │   └── roles.ts
    │       ├── navigation/
    │       │   ├── mobile.types.ts
    │       │   └── web.types.ts
    │       ├── rbac/
    │       │   └── index.ts
    │       ├── types/
    │       │   ├── auth.types.ts
    │       │   ├── firestore.types.ts
    │       │   └── user.types.ts
    │       └── utils/
    │           ├── errors.ts
    │           └── validators.ts
    └── shared-ui/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts
            ├── guards/
            │   └── role-guard.ts
            └── theme/
                ├── colors.ts
                ├── index.ts
                ├── spacing.ts
                └── typography.ts
```

---

## 2. ROOT package.json

```json
{
  "name": "spartan-g",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "mobile": "npm run start --workspace=@spartan-g/mobile",
    "web": "npm run dev --workspace=@spartan-g/web",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "build:web": "npm run build --workspace=@spartan-g/web"
  },
  "devDependencies": {
    "typescript": "~5.3.0"
  }
}
```

---

## 3. APP package.json FILES

### apps/web/package.json

```json
{
  "name": "@spartan-g/web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@spartan-g/shared-services": "*",
    "@spartan-g/shared-types": "*",
    "@spartan-g/shared-ui": "*",
    "firebase": "^11.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.3.0",
    "typescript": "~5.3.0",
    "vite": "^5.4.11"
  }
}
```

### apps/mobile/package.json

```json
{
  "name": "@spartan-g/mobile",
  "version": "1.0.0",
  "private": true,
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@react-navigation/bottom-tabs": "^7.2.0",
    "@react-navigation/native": "^7.0.14",
    "@react-navigation/native-stack": "^7.0.14",
    "@spartan-g/shared-services": "*",
    "@spartan-g/shared-types": "*",
    "@spartan-g/shared-ui": "*",
    "expo": "~52.0.0",
    "expo-constants": "~17.0.0",
    "expo-device": "~7.0.0",
    "expo-notifications": "~0.29.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.5",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~18.3.12",
    "typescript": "~5.3.0"
  }
}
```

### packages/shared-types/package.json

```json
{
  "name": "@spartan-g/shared-types",
  "version": "1.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "~5.3.0"
  }
}
```

### packages/shared-services/package.json

```json
{
  "name": "@spartan-g/shared-services",
  "version": "1.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@spartan-g/shared-types": "*",
    "firebase": "^11.0.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "typescript": "~5.3.0"
  }
}
```

### packages/shared-ui/package.json

```json
{
  "name": "@spartan-g/shared-ui",
  "version": "1.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@spartan-g/shared-types": "*"
  },
  "devDependencies": {
    "typescript": "~5.3.0"
  }
}
```

---

## 4. tsconfig.base.json

```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

## 5. Vite + Tailwind CONFIG

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: 3000 },
});
```

### global.css

```css
@import "tailwindcss";
```

**Note:** Tailwind v4 is used, which auto-detects classes. No `tailwind.config.js` — it uses the `@import "tailwindcss"` CSS approach with `@tailwindcss/vite` plugin.

---

## 6. WEB APP CORE FILES

### src/main.tsx

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### src/app/App.tsx

```typescript
import { AppProviders } from '../providers/AppProviders';
import { AppRouter } from '../navigation/AppRouter';

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
```

### src/providers/AppProviders.tsx

```typescript
import type { ReactNode } from "react";

interface AppProvidersProps { children: ReactNode; }

export function AppProviders({ children }: AppProvidersProps) {
  return <>{children}</>;
}
```

### src/firebase/firebase.ts (assumed — Firebase init)

```typescript
// Web-specific Firebase init with Vite env vars
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

### src/types/auth.types.ts

```typescript
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
```

---

## 7. WEB AUTH FLOW (hooks + lib)

### src/hooks/useAuth.tsx

```typescript
import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from "react";
import type { AuthUser, AuthStatus, LoginFormData, RegisterFormData } from "../types/auth.types";
import { registerUser, loginUser, logoutUser, resetPassword, onAuthChange } from "../lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  register: (data: RegisterFormData) => Promise<void>;
  login: (data: LoginFormData) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => {
      if (authUser) { setUser(authUser); setStatus("authenticated"); }
      else { setUser(null); setStatus("unauthenticated"); }
    });
    return unsubscribe;
  }, []);

  const register = useCallback(async (data: RegisterFormData) => {
    setStatus("loading"); setError(null);
    try {
      const authUser = await registerUser(data.email, data.password, data.firstName, data.lastName, data.role);
      setUser(authUser); setStatus("authenticated");
    } catch (err) {
      setStatus("unauthenticated");
      setError(err instanceof Error ? err.message : "Registration failed");
      throw err;
    }
  }, []);

  const login = useCallback(async (data: LoginFormData) => {
    setStatus("loading"); setError(null);
    try {
      const authUser = await loginUser(data.email, data.password);
      setUser(authUser); setStatus("authenticated");
    } catch (err) {
      setStatus("unauthenticated");
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    setStatus("loading"); setError(null);
    try {
      await logoutUser(); setUser(null); setStatus("unauthenticated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");
      setStatus("authenticated"); throw err;
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    setError(null);
    try { await resetPassword(email); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to send reset email"); throw err; }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider value={{ user, status, error, register, login, logout, forgotPassword, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
```

### src/lib/auth.ts

```typescript
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, onAuthStateChanged, updateProfile, type User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";
import type { Role, AuthUser, UserDocument } from "../types/auth.types";

export async function registerUser(email: string, password: string, firstName: string, lastName: string, role: Role = "student"): Promise<AuthUser> {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName: `${firstName} ${lastName}` });
  const userDoc: Omit<UserDocument, "createdAt" | "updatedAt"> = { uid: user.uid, firstName, lastName, email: user.email!, role, isActive: true };
  await setDoc(doc(db, "users", user.uid), { ...userDoc, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { uid: user.uid, email: user.email, displayName: user.displayName, role, isActive: true };
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return buildAuthUser(user);
}

export async function logoutUser(): Promise<void> { await signOut(auth); }
export async function resetPassword(email: string): Promise<void> { await sendPasswordResetEmail(auth, email); }

export function onAuthChange(callback: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) { callback(null); return; }
    try { const authUser = await buildAuthUser(firebaseUser); callback(authUser); }
    catch { callback(null); }
  });
}

async function buildAuthUser(firebaseUser: User): Promise<AuthUser> {
  const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
  const userData = userDoc.data() as UserDocument | undefined;
  if (!userData || !userData.isActive) { await signOut(auth); throw new Error("Account is deactivated"); }
  return { uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName, role: userData.role, isActive: userData.isActive };
}

export function getRoleRedirect(role: Role): string {
  const routes: Record<Role, string> = { student: "/student/dashboard", facilitator: "/facilitator/dashboard", super_admin: "/admin/dashboard" };
  return routes[role];
}
```

---

## 8. WEB UI COMPONENTS — Code Style Reference

### Button.tsx

```typescript
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  children: ReactNode;
  type?: "button" | "submit" | "reset";
}

const variantStyles: Record<string, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500",
  secondary: "bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500",
  outline: "border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 focus:ring-indigo-500",
  ghost: "text-gray-600 hover:bg-gray-100 focus:ring-gray-500",
  danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
};

const sizeStyles: Record<string, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

export function Button({ variant = "primary", size = "md", isLoading = false, disabled, children, className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
```

### Input.tsx

```typescript
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = "", ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1">
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">{label}</label>
        <input
          ref={ref}
          id={inputId}
          className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed ${error ? "border-red-500 focus:ring-red-500 focus:border-red-500" : "border-gray-300"} ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && <p id={`${inputId}-error`} className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
```

### AuthLayout.tsx

```typescript
import type { ReactNode } from "react";

interface AuthLayoutProps { title: string; subtitle?: string; children: ReactNode; }

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600">
            <span className="text-xl font-bold text-white">SG</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-gray-600">{subtitle}</p>}
        </div>
        <div className="rounded-xl bg-white p-8 shadow-lg ring-1 ring-gray-200">{children}</div>
        <p className="text-center text-xs text-gray-500">&copy; {new Date().getFullYear()} SPARTAN-G. All rights reserved.</p>
      </div>
    </div>
  );
}
```

### ProtectedRoute.tsx

```typescript
import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import type { Role } from "../../types/auth.types";
import type { ReactNode } from "react";

interface ProtectedRouteProps { children: ReactNode; allowedRoles: Role[]; }

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, status } = useAuth();
  if (status === "idle" || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }
  if (status === "unauthenticated" || !user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) {
    const redirectMap: Record<Role, string> = { student: "/student/dashboard", facilitator: "/facilitator/dashboard", super_admin: "/admin/dashboard" };
    return <Navigate to={redirectMap[user.role]} replace />;
  }
  return <>{children}</>;
}
```

---

## 9. COMPLETED PAGE EXAMPLE — LoginPage.tsx

```typescript
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthLayout } from "../components/auth/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { getRoleRedirect } from "../lib/auth";

export function LoginPage() {
  const { login, user, error, clearError } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) return <Navigate to={getRoleRedirect(user.role)} replace />;

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Invalid email address";
    if (!password) errors.password = "Password is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    if (!validate()) return;
    setIsLoading(true);
    try {
      await login({ email, password });
    } catch { /* Error is set in auth context */ }
    finally { setIsLoading(false); }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your SPARTAN-G account">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <Input label="Email" type="email" placeholder="you@example.com" value={email}
          onChange={(e) => setEmail(e.target.value)} error={formErrors.email}
          autoComplete="email" disabled={isLoading} />
        <Input label="Password" type="password" placeholder="Enter your password" value={password}
          onChange={(e) => setPassword(e.target.value)} error={formErrors.password}
          autoComplete="current-password" disabled={isLoading} />
        <div className="flex items-center justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" isLoading={isLoading} className="w-full">Sign in</Button>
        <p className="text-center text-sm text-gray-600">
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">Create one</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
```

---

## 10. CURRENT PLACEHOLDER PAGE — DashboardPage.tsx (the only working non-auth page)

```typescript
import { useAuth } from "../hooks/useAuth";
import { ROLE_LABELS } from "../types/auth.types";
import { useNavigate } from "react-router-dom";

interface DashboardPageProps { title: string; portalName: string; }

export function DashboardPage({ title, portalName }: DashboardPageProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
              <span className="text-sm font-bold text-white">SG</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{portalName}</h1>
              <p className="text-xs text-gray-500">{title}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">{user?.displayName}</p>
              <p className="text-xs text-gray-500">{user ? ROLE_LABELS[user.role] : ""}</p>
            </div>
            <button onClick={handleLogout}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
            <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Coming Soon</h2>
          <p className="mt-2 text-sm text-gray-500">The {portalName} features are currently under development.</p>
        </div>
      </main>
    </div>
  );
}
```

---

## 11. WEB ROUTER — AppRouter.tsx

```typescript
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import type { ReactNode } from "react";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600">
          <span className="text-xl font-bold text-white">SG</span>
        </div>
        <div className="flex items-center space-x-2">
          <svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-gray-500">Loading SPARTAN-G...</p>
        </div>
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "idle" || status === "loading") return <LoadingScreen />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login" element={user ? <Navigate to={user.role === "student" ? "/student/dashboard" : user.role === "facilitator" ? "/facilitator/dashboard" : "/admin/dashboard"} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to={user.role === "student" ? "/student/dashboard" : user.role === "facilitator" ? "/facilitator/dashboard" : "/admin/dashboard"} replace /> : <RegisterPage />} />
      <Route path="/forgot-password" element={user ? <Navigate to={user.role === "student" ? "/student/dashboard" : user.role === "facilitator" ? "/facilitator/dashboard" : "/admin/dashboard"} replace /> : <ForgotPasswordPage />} />

      {/* Student routes */}
      <Route path="/student/*" element={
        <ProtectedRoute allowedRoles={["student"]}>
          <Routes>
            <Route path="dashboard" element={<DashboardPage title="Student Dashboard" portalName="Student Portal" />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </ProtectedRoute>
      } />

      {/* Facilitator routes */}
      <Route path="/facilitator/*" element={
        <ProtectedRoute allowedRoles={["facilitator"]}>
          <Routes>
            <Route path="dashboard" element={<DashboardPage title="Facilitator Dashboard" portalName="Facilitator Portal" />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </ProtectedRoute>
      } />

      {/* Admin routes */}
      <Route path="/admin/*" element={
        <ProtectedRoute allowedRoles={["super_admin"]}>
          <Routes>
            <Route path="dashboard" element={<DashboardPage title="Admin Dashboard" portalName="Super Admin Portal" />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </ProtectedRoute>
      } />

      {/* Default redirect */}
      <Route path="*" element={user ? <Navigate to={user.role === "student" ? "/student/dashboard" : user.role === "facilitator" ? "/facilitator/dashboard" : "/admin/dashboard"} replace /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <AppRoutes />
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

---

## 12. PLACEHOLDER ROUTE COMPONENTS (current state of all non-auth routes)

### StudentPortalRoutes.tsx
```typescript
import { Routes, Route } from 'react-router-dom';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function StudentPortalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PlaceholderPage title="Student Home" portal="Student Web Portal" />} />
      <Route path="/courses" element={<PlaceholderPage title="Courses" portal="Student Web Portal" />} />
      <Route path="/courses/:courseId" element={<PlaceholderPage title="Course Detail" portal="Student Web Portal" />} />
      <Route path="/assignments" element={<PlaceholderPage title="Assignments" portal="Student Web Portal" />} />
      <Route path="/assignments/:assignmentId" element={<PlaceholderPage title="Assignment Detail" portal="Student Web Portal" />} />
      <Route path="/messages" element={<PlaceholderPage title="Messages" portal="Student Web Portal" />} />
      <Route path="/messages/:conversationId" element={<PlaceholderPage title="Conversation" portal="Student Web Portal" />} />
      <Route path="/profile" element={<PlaceholderPage title="Profile" portal="Student Web Portal" />} />
    </Routes>
  );
}
```

### FacilitatorPortalRoutes.tsx
```typescript
import { Routes, Route } from 'react-router-dom';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function FacilitatorPortalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PlaceholderPage title="Facilitator Dashboard" portal="Facilitator Web Portal" />} />
      <Route path="/courses" element={<PlaceholderPage title="Courses" portal="Facilitator Web Portal" />} />
      <Route path="/courses/:courseId" element={<PlaceholderPage title="Manage Course" portal="Facilitator Web Portal" />} />
      <Route path="/students" element={<PlaceholderPage title="Students" portal="Facilitator Web Portal" />} />
      <Route path="/risk-alerts" element={<PlaceholderPage title="Risk Alerts" portal="Facilitator Web Portal" />} />
      <Route path="/risk-alerts/:alertId" element={<PlaceholderPage title="Risk Alert Detail" portal="Facilitator Web Portal" />} />
      <Route path="/appointments" element={<PlaceholderPage title="Appointments" portal="Facilitator Web Portal" />} />
      <Route path="/appointments/:appointmentId" element={<PlaceholderPage title="Appointment Detail" portal="Facilitator Web Portal" />} />
      <Route path="/messages" element={<PlaceholderPage title="Messages" portal="Facilitator Web Portal" />} />
      <Route path="/messages/:conversationId" element={<PlaceholderPage title="Conversation" portal="Facilitator Web Portal" />} />
      <Route path="/work-hours" element={<PlaceholderPage title="Work Hours Schedule" portal="Facilitator Web Portal" />} />
      <Route path="/profile" element={<PlaceholderPage title="Profile" portal="Facilitator Web Portal" />} />
    </Routes>
  );
}
```

### SuperAdminPortalRoutes.tsx
```typescript
import { Routes, Route } from 'react-router-dom';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function SuperAdminPortalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PlaceholderPage title="Admin Dashboard" portal="Super Admin Web Portal" />} />
      <Route path="/users" element={<PlaceholderPage title="User Management" portal="Super Admin Web Portal" />} />
      <Route path="/users/:userId" element={<PlaceholderPage title="User Detail" portal="Super Admin Web Portal" />} />
      <Route path="/analytics" element={<PlaceholderPage title="System Analytics" portal="Super Admin Web Portal" />} />
      <Route path="/settings" element={<PlaceholderPage title="Platform Settings" portal="Super Admin Web Portal" />} />
      <Route path="/audit-logs" element={<PlaceholderPage title="Audit Logs" portal="Super Admin Web Portal" />} />
    </Routes>
  );
}
```

---

## 13. MOBILE APP — Navigation Architecture

### RootNavigator.tsx
```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { ROLES, MobileRootStackParamList, requiresWebPortal } from '@spartan-g/shared-types';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';
import { AuthNavigator } from './AuthNavigator';
import { StudentNavigator } from './StudentNavigator';
import { FacilitatorNavigator } from './FacilitatorNavigator';
import { WebOnlyScreen } from './WebOnlyScreen';
import { mobileLinking } from './linking';

const Stack = createNativeStackNavigator<MobileRootStackParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={lightColors.primary} />
      <Text style={styles.loadingText}>Loading SPARTAN-G...</Text>
    </View>
  );
}

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isLoading = status === 'loading' || !isInitialized;
  const isAuthenticated = status === 'authenticated' && session !== null;
  const role = session?.role ?? null;

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated && role && requiresWebPortal(role)) return <WebOnlyScreen />;

  return (
    <NavigationContainer linking={mobileLinking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated || !role ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : role === ROLES.FACILITATOR ? (
          <Stack.Screen name="Facilitator" component={FacilitatorNavigator} />
        ) : (
          <Stack.Screen name="Student" component={StudentNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: lightColors.background, gap: 16 },
  loadingText: { color: lightColors.textSecondary },
});
```

### StudentNavigator.tsx
```typescript
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StudentMobileStackParamList, StudentMobileTabParamList } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

const Tab = createBottomTabNavigator<StudentMobileTabParamList>();
const Stack = createNativeStackNavigator<StudentMobileStackParamList>();

function StudentTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: lightColors.primary, tabBarInactiveTintColor: lightColors.textMuted }}>
      <Tab.Screen name="StudentHome" options={{ title: 'Home' }}>{() => <PlaceholderScreen routeName="StudentHome" />}</Tab.Screen>
      <Tab.Screen name="StudentCourses" options={{ title: 'Courses' }}>{() => <PlaceholderScreen routeName="StudentCourses" />}</Tab.Screen>
      <Tab.Screen name="StudentAssignments" options={{ title: 'Assignments' }}>{() => <PlaceholderScreen routeName="StudentAssignments" />}</Tab.Screen>
      <Tab.Screen name="StudentMessages" options={{ title: 'Messages' }}>{() => <PlaceholderScreen routeName="StudentMessages" />}</Tab.Screen>
      <Tab.Screen name="StudentProfile" options={{ title: 'Profile' }}>{() => <PlaceholderScreen routeName="StudentProfile" />}</Tab.Screen>
    </Tab.Navigator>
  );
}

export function StudentNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="StudentTabs" component={StudentTabs} options={{ headerShown: false }} />
      <Stack.Screen name="CourseDetail" options={{ title: 'Course' }}>{() => <PlaceholderScreen routeName="CourseDetail" />}</Stack.Screen>
      <Stack.Screen name="AssignmentDetail" options={{ title: 'Assignment' }}>{() => <PlaceholderScreen routeName="AssignmentDetail" />}</Stack.Screen>
      <Stack.Screen name="ConversationDetail" options={{ title: 'Conversation' }}>{() => <PlaceholderScreen routeName="ConversationDetail" />}</Stack.Screen>
    </Stack.Navigator>
  );
}
```

### FacilitatorNavigator.tsx
```typescript
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FacilitatorMobileStackParamList, FacilitatorMobileTabParamList } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

const Tab = createBottomTabNavigator<FacilitatorMobileTabParamList>();
const Stack = createNativeStackNavigator<FacilitatorMobileStackParamList>();

function FacilitatorTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: lightColors.primary, tabBarInactiveTintColor: lightColors.textMuted }}>
      <Tab.Screen name="FacilitatorDashboard" options={{ title: 'Dashboard' }}>{() => <PlaceholderScreen routeName="FacilitatorDashboard" />}</Tab.Screen>
      <Tab.Screen name="RiskAlerts" options={{ title: 'Risk Alerts' }}>{() => <PlaceholderScreen routeName="RiskAlerts" />}</Tab.Screen>
      <Tab.Screen name="Appointments" options={{ title: 'Appointments' }}>{() => <PlaceholderScreen routeName="Appointments" />}</Tab.Screen>
      <Tab.Screen name="Messaging" options={{ title: 'Messages' }}>{() => <PlaceholderScreen routeName="Messaging" />}</Tab.Screen>
      <Tab.Screen name="WorkHoursSchedule" options={{ title: 'Work Hours' }}>{() => <PlaceholderScreen routeName="WorkHoursSchedule" />}</Tab.Screen>
      <Tab.Screen name="FacilitatorProfile" options={{ title: 'Profile' }}>{() => <PlaceholderScreen routeName="FacilitatorProfile" />}</Tab.Screen>
    </Tab.Navigator>
  );
}

export function FacilitatorNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="FacilitatorTabs" component={FacilitatorTabs} options={{ headerShown: false }} />
      <Stack.Screen name="RiskAlertDetail" options={{ title: 'Risk Alert' }}>{() => <PlaceholderScreen routeName="RiskAlertDetail" />}</Stack.Screen>
      <Stack.Screen name="AppointmentDetail" options={{ title: 'Appointment' }}>{() => <PlaceholderScreen routeName="AppointmentDetail" />}</Stack.Screen>
      <Stack.Screen name="ConversationDetail" options={{ title: 'Conversation' }}>{() => <PlaceholderScreen routeName="ConversationDetail" />}</Stack.Screen>
      <Stack.Screen name="ManageCourse" options={{ title: 'Manage Course' }}>{() => <PlaceholderScreen routeName="ManageCourse" />}</Stack.Screen>
      <Stack.Screen name="GradeSubmission" options={{ title: 'Grade' }}>{() => <PlaceholderScreen routeName="GradeSubmission" />}</Stack.Screen>
    </Stack.Navigator>
  );
}
```

---

## 14. SHARED PACKAGES

### shared-types/src/constants/roles.ts
```typescript
export const ROLES = { STUDENT: 'student', FACILITATOR: 'facilitator', SUPER_ADMIN: 'super_admin' } as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];
export const ROLE_LABELS: Record<Role, string> = { [ROLES.STUDENT]: 'Student', [ROLES.FACILITATOR]: 'Facilitator', [ROLES.SUPER_ADMIN]: 'Super Admin' };
export const ROLE_HIERARCHY: Record<Role, number> = { [ROLES.STUDENT]: 1, [ROLES.FACILITATOR]: 2, [ROLES.SUPER_ADMIN]: 3 };
```

### shared-types/src/constants/platforms.ts
```typescript
import { ROLES, Role } from './roles';
export const PLATFORMS = { MOBILE: 'mobile', WEB: 'web' } as const;
export type Platform = (typeof PLATFORMS)[keyof typeof PLATFORMS];
export const DEPLOYMENT_TARGETS = { STUDENT_MOBILE: 'student_mobile', STUDENT_WEB: 'student_web', FACILITATOR_MOBILE: 'facilitator_mobile', FACILITATOR_WEB: 'facilitator_web', SUPER_ADMIN_WEB: 'super_admin_web' } as const;
export type DeploymentTarget = (typeof DEPLOYMENT_TARGETS)[keyof typeof DEPLOYMENT_TARGETS];
export const PLATFORM_ROLE_ACCESS: Record<Platform, readonly Role[]> = {
  [PLATFORMS.MOBILE]: [ROLES.STUDENT, ROLES.FACILITATOR],
  [PLATFORMS.WEB]: [ROLES.STUDENT, ROLES.FACILITATOR, ROLES.SUPER_ADMIN],
};
export const DEPLOYMENT_TARGET_CONFIG: Record<DeploymentTarget, { role: Role; platform: Platform; label: string }> = {
  [DEPLOYMENT_TARGETS.STUDENT_MOBILE]: { role: ROLES.STUDENT, platform: PLATFORMS.MOBILE, label: 'Student Mobile App' },
  [DEPLOYMENT_TARGETS.STUDENT_WEB]: { role: ROLES.STUDENT, platform: PLATFORMS.WEB, label: 'Student Web Portal' },
  [DEPLOYMENT_TARGETS.FACILITATOR_MOBILE]: { role: ROLES.FACILITATOR, platform: PLATFORMS.MOBILE, label: 'Facilitator Mobile App' },
  [DEPLOYMENT_TARGETS.FACILITATOR_WEB]: { role: ROLES.FACILITATOR, platform: PLATFORMS.WEB, label: 'Facilitator Web Portal' },
  [DEPLOYMENT_TARGETS.SUPER_ADMIN_WEB]: { role: ROLES.SUPER_ADMIN, platform: PLATFORMS.WEB, label: 'Super Admin Web Portal' },
};
```

### shared-types/src/constants/permissions.ts
```typescript
import { ROLES, Role } from './roles';
export const PERMISSIONS = {
  VIEW_OWN_PROFILE: 'view_own_profile', EDIT_OWN_PROFILE: 'edit_own_profile',
  VIEW_COURSES: 'view_courses', ENROLL_COURSE: 'enroll_course', SUBMIT_ASSIGNMENT: 'submit_assignment',
  MANAGE_STUDENTS: 'manage_students', GRADE_ASSIGNMENTS: 'grade_assignments', CREATE_COURSE_CONTENT: 'create_course_content', VIEW_FACILITATOR_DASHBOARD: 'view_facilitator_dashboard',
  VIEW_RISK_ALERTS: 'view_risk_alerts', MANAGE_APPOINTMENTS: 'manage_appointments', SEND_MESSAGES: 'send_messages', MANAGE_WORK_HOURS: 'manage_work_hours',
  MANAGE_USERS: 'manage_users', MANAGE_ROLES: 'manage_roles', VIEW_SYSTEM_ANALYTICS: 'view_system_analytics', MANAGE_PLATFORM_SETTINGS: 'manage_platform_settings',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [ROLES.STUDENT]: [PERMISSIONS.VIEW_OWN_PROFILE, PERMISSIONS.EDIT_OWN_PROFILE, PERMISSIONS.VIEW_COURSES, PERMISSIONS.ENROLL_COURSE, PERMISSIONS.SUBMIT_ASSIGNMENT, PERMISSIONS.SEND_MESSAGES],
  [ROLES.FACILITATOR]: [PERMISSIONS.VIEW_OWN_PROFILE, PERMISSIONS.EDIT_OWN_PROFILE, PERMISSIONS.VIEW_COURSES, PERMISSIONS.MANAGE_STUDENTS, PERMISSIONS.GRADE_ASSIGNMENTS, PERMISSIONS.CREATE_COURSE_CONTENT, PERMISSIONS.VIEW_FACILITATOR_DASHBOARD, PERMISSIONS.VIEW_RISK_ALERTS, PERMISSIONS.MANAGE_APPOINTMENTS, PERMISSIONS.SEND_MESSAGES, PERMISSIONS.MANAGE_WORK_HOURS],
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
};
```

### shared-types/src/constants/firestore-schemas.ts
```typescript
import { Role } from './roles';
export const FIRESTORE_SCHEMAS = {
  users: { uid: 'string', email: 'string', displayName: 'string', role: 'student | facilitator | super_admin' as Role, photoURL: 'string?', isActive: 'boolean', createdAt: 'timestamp', updatedAt: 'timestamp' },
  profiles: { uid: 'string', bio: 'string?', phone: 'string?', institution: 'string?', avatarUrl: 'string?', metadata: 'map?', updatedAt: 'timestamp' },
  courses: { title: 'string', description: 'string', facilitatorId: 'string', isPublished: 'boolean', tags: 'string[]', createdAt: 'timestamp', updatedAt: 'timestamp' },
  enrollments: { courseId: 'string', studentId: 'string', status: 'active | completed | dropped', enrolledAt: 'timestamp', createdAt: 'timestamp', updatedAt: 'timestamp' },
  assignments: { courseId: 'string', title: 'string', description: 'string', dueAt: 'timestamp', maxScore: 'number', createdAt: 'timestamp', updatedAt: 'timestamp' },
  submissions: { assignmentId: 'string', studentId: 'string', fileUrl: 'string?', content: 'string?', score: 'number?', feedback: 'string?', submittedAt: 'timestamp', createdAt: 'timestamp', updatedAt: 'timestamp' },
  notifications: { userId: 'string', title: 'string', body: 'string', type: 'info | alert | assignment | grade | risk | appointment | work_hours', isRead: 'boolean', data: 'map?', createdAt: 'timestamp', updatedAt: 'timestamp' },
  device_tokens: { uid: 'string', token: 'string', platform: 'ios | android | web', deploymentTarget: 'string', createdAt: 'timestamp', updatedAt: 'timestamp' },
  announcements: { title: 'string', body: 'string', authorId: 'string', targetRoles: 'string[]', isActive: 'boolean', createdAt: 'timestamp', updatedAt: 'timestamp' },
  audit_logs: { actorId: 'string', action: 'string', resource: 'string', resourceId: 'string', metadata: 'map?', createdAt: 'timestamp' },
  risk_alerts: { studentId: 'string', facilitatorId: 'string', severity: 'low | medium | high | critical', title: 'string', description: 'string', status: 'open | acknowledged | resolved', createdAt: 'timestamp', updatedAt: 'timestamp' },
  appointments: { studentId: 'string', facilitatorId: 'string', scheduledAt: 'timestamp', durationMinutes: 'number', status: 'scheduled | completed | cancelled', notes: 'string?', notifyBeforeMinutes: 'number', createdAt: 'timestamp', updatedAt: 'timestamp' },
  conversations: { participantIds: 'string[]', lastMessageAt: 'timestamp', lastMessagePreview: 'string', createdAt: 'timestamp', updatedAt: 'timestamp' },
  messages: { conversationId: 'string', senderId: 'string', body: 'string', attachmentUrl: 'string?', isRead: 'boolean', createdAt: 'timestamp' },
  work_hours_schedules: { facilitatorId: 'string', dayOfWeek: 'number', startTime: 'string', endTime: 'string', isActive: 'boolean', notifyBeforeMinutes: 'number', createdAt: 'timestamp', updatedAt: 'timestamp' },
} as const;
```

### shared-types/src/rbac/index.ts
```typescript
import { ROLES, Role, ROLE_HIERARCHY } from '../constants/roles';
import { PERMISSIONS, Permission, ROLE_PERMISSIONS } from '../constants/permissions';
import { PLATFORMS, Platform, PLATFORM_ROLE_ACCESS, DeploymentTarget } from '../constants/platforms';

export function getRolePermissions(role: Role): readonly Permission[] { return ROLE_PERMISSIONS[role] ?? []; }
export function hasPermission(role: Role, permission: Permission): boolean { return getRolePermissions(role).includes(permission); }
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean { return permissions.some((p) => hasPermission(role, p)); }
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean { return permissions.every((p) => hasPermission(role, p)); }
export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean { return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]; }
export function isStudent(role: Role): boolean { return role === ROLES.STUDENT; }
export function isFacilitator(role: Role): boolean { return role === ROLES.FACILITATOR; }
export function isSuperAdmin(role: Role): boolean { return role === ROLES.SUPER_ADMIN; }
export function canAccessPlatform(role: Role, platform: Platform): boolean { return PLATFORM_ROLE_ACCESS[platform].includes(role); }
export function assertPlatformAccess(role: Role, platform: Platform): boolean { if (!canAccessPlatform(role, platform)) return false; return true; }
export function requiresWebPortal(role: Role): boolean { return role === ROLES.SUPER_ADMIN; }
export function canAccessDeploymentTarget(role: Role, platform: Platform, target: DeploymentTarget): boolean {
  if (!canAccessPlatform(role, platform)) return false;
  if (platform === PLATFORMS.MOBILE && role === ROLES.SUPER_ADMIN) return false;
  return true;
}
export { PERMISSIONS, ROLES, PLATFORMS };
```

### shared-types/src/navigation/mobile.types.ts
```typescript
export type NavigatorScreenParams<T extends Record<string, object | undefined>> = { screen?: keyof T; params?: T[keyof T]; initial?: boolean; path?: string; state?: object; };
export type MobileAuthStackParamList = { Login: undefined; Register: undefined; ForgotPassword: undefined; WebOnlyRedirect: undefined; };
export type StudentMobileTabParamList = { StudentHome: undefined; StudentCourses: undefined; StudentAssignments: undefined; StudentMessages: undefined; StudentProfile: undefined; };
export type StudentMobileStackParamList = { StudentTabs: NavigatorScreenParams<StudentMobileTabParamList>; CourseDetail: { courseId: string }; AssignmentDetail: { assignmentId: string }; ConversationDetail: { conversationId: string }; };
export type FacilitatorMobileTabParamList = { FacilitatorDashboard: undefined; RiskAlerts: undefined; Appointments: undefined; Messaging: undefined; WorkHoursSchedule: undefined; FacilitatorProfile: undefined; };
export type FacilitatorMobileStackParamList = { FacilitatorTabs: NavigatorScreenParams<FacilitatorMobileTabParamList>; RiskAlertDetail: { alertId: string }; AppointmentDetail: { appointmentId: string }; ConversationDetail: { conversationId: string }; ManageCourse: { courseId: string }; GradeSubmission: { submissionId: string }; };
export type MobileRootStackParamList = { Auth: NavigatorScreenParams<MobileAuthStackParamList>; Student: NavigatorScreenParams<StudentMobileStackParamList>; Facilitator: NavigatorScreenParams<FacilitatorMobileStackParamList>; };
```

### shared-types/src/navigation/web.types.ts
```typescript
export type AuthRouteParams = { Login: undefined; Register: undefined; ForgotPassword: undefined; };
export type StudentWebRouteParams = { Dashboard: undefined; Courses: undefined; CourseDetail: { courseId: string }; Assignments: undefined; AssignmentDetail: { assignmentId: string }; Messages: undefined; ConversationDetail: { conversationId: string }; Profile: undefined; };
export type FacilitatorWebRouteParams = { Dashboard: undefined; Courses: undefined; CourseDetail: { courseId: string }; Students: undefined; RiskAlerts: undefined; RiskAlertDetail: { alertId: string }; Appointments: undefined; AppointmentDetail: { appointmentId: string }; Messages: undefined; ConversationDetail: { conversationId: string }; WorkHours: undefined; Profile: undefined; };
export type SuperAdminWebRouteParams = { Dashboard: undefined; Users: undefined; UserDetail: { userId: string }; Analytics: undefined; Settings: undefined; AuditLogs: undefined; };
```

### shared-types/src/types/firestore.types.ts
```typescript
import { Timestamp } from 'firebase/firestore';
export interface FirestoreDocument { id: string; createdAt?: Timestamp; updatedAt?: Timestamp; }
export interface CourseDocument extends FirestoreDocument { title: string; description: string; facilitatorId: string; isPublished: boolean; tags: string[]; }
export interface EnrollmentDocument extends FirestoreDocument { courseId: string; studentId: string; status: 'active' | 'completed' | 'dropped'; enrolledAt: Timestamp; }
export interface AssignmentDocument extends FirestoreDocument { courseId: string; title: string; description: string; dueAt: Timestamp; maxScore: number; }
export interface SubmissionDocument extends FirestoreDocument { assignmentId: string; studentId: string; fileUrl?: string; content?: string; score?: number; feedback?: string; submittedAt: Timestamp; }
export interface NotificationDocument extends FirestoreDocument { userId: string; title: string; body: string; type: 'info' | 'alert' | 'assignment' | 'grade' | 'risk' | 'appointment' | 'work_hours'; isRead: boolean; data?: Record<string, string>; }
export interface AnnouncementDocument extends FirestoreDocument { title: string; body: string; authorId: string; targetRoles: string[]; isActive: boolean; }
export interface AuditLogDocument extends FirestoreDocument { actorId: string; action: string; resource: string; resourceId: string; metadata?: Record<string, unknown>; }
export interface RiskAlertDocument extends FirestoreDocument { studentId: string; facilitatorId: string; severity: 'low' | 'medium' | 'high' | 'critical'; title: string; description: string; status: 'open' | 'acknowledged' | 'resolved'; }
export interface AppointmentDocument extends FirestoreDocument { studentId: string; facilitatorId: string; scheduledAt: Timestamp; durationMinutes: number; status: 'scheduled' | 'completed' | 'cancelled'; notes?: string; notifyBeforeMinutes: number; }
export interface ConversationDocument extends FirestoreDocument { participantIds: string[]; lastMessageAt: Timestamp; lastMessagePreview: string; }
export interface MessageDocument extends FirestoreDocument { conversationId: string; senderId: string; body: string; attachmentUrl?: string; isRead: boolean; }
export interface WorkHoursScheduleDocument extends FirestoreDocument { facilitatorId: string; dayOfWeek: number; startTime: string; endTime: string; isActive: boolean; notifyBeforeMinutes: number; }
```

---

## 15. SHARED SERVICES — Key Files

### src/store/auth.store.ts
```typescript
import { create } from 'zustand';
import { AuthCredentials, AuthSession, AuthStatus, RegisterPayload, Platform, getErrorMessage } from '@spartan-g/shared-types';
import { onAuthStateChanged, getFirebaseAuth } from '../firebase/auth';
import { authService } from '../services/auth.service';
import { resolveDeploymentTarget } from '../config/env';

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
  isInitialized: boolean;
  platform: Platform | null;
  setPlatform: (platform: Platform) => void;
  initialize: () => () => void;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

export const createAuthStore = () =>
  create<AuthState>((set, get) => ({
    status: 'idle', session: null, error: null, isInitialized: false, platform: null,
    setPlatform: (platform) => set({ platform }),
    initialize: () => {
      set({ status: 'loading' });
      const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
        const platform = get().platform;
        if (!firebaseUser) { set({ status: 'unauthenticated', session: null, isInitialized: true }); return; }
        try {
          const session = await authService.buildSession(firebaseUser);
          if (platform) authService.assertPlatformAccess(session.role, platform);
          set({ status: 'authenticated', session, error: null, isInitialized: true });
        } catch (error) { set({ status: 'unauthenticated', session: null, error: getErrorMessage(error), isInitialized: true }); }
      });
      return unsubscribe;
    },
    signIn: async (credentials) => { /* ... */ },
    register: async (payload) => { /* ... */ },
    signOut: async () => { /* ... */ },
    resetPassword: async (email) => { /* ... */ },
    clearError: () => set({ error: null }),
  }));

export const useAuthStore = createAuthStore();
```

### src/repositories/base.repository.ts
```typescript
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, onSnapshot, serverTimestamp, DocumentData, QueryConstraint, Unsubscribe } from '../firebase/firestore';
import { getFirestoreDb } from '../firebase/firestore';
import { RepositoryError } from '@spartan-g/shared-types';

export abstract class BaseRepository<T extends DocumentData> {
  constructor(protected readonly collectionName: string) {}
  protected getCollectionRef() { return collection(getFirestoreDb(), this.collectionName); }
  protected getDocRef(id: string) { return doc(getFirestoreDb(), this.collectionName, id); }
  async getById(id: string): Promise<(T & { id: string }) | null> { /* ... */ }
  async getAll(constraints: QueryConstraint[] = []): Promise<(T & { id: string })[]> { /* ... */ }
  async create(id: string, data: T): Promise<void> { /* ... adds createdAt, updatedAt */ }
  async update(id: string, data: Partial<T>): Promise<void> { /* ... adds updatedAt */ }
  async delete(id: string): Promise<void> { /* ... */ }
  subscribe(id: string, callback: (data: (T & { id: string }) | null) => void): Unsubscribe { /* ... */ }
  subscribeQuery(constraints: QueryConstraint[], callback: (data: (T & { id: string })[]) => void): Unsubscribe { /* ... */ }
}
```

---

## 16. SHARED UI — Theme System

### src/theme/colors.ts
```typescript
export const palette = { spartanRed: '#DC2626', spartanRedDark: '#991B1B', spartanGold: '#F59E0B', slate900: '#0F172A', slate800: '#1E293B', slate700: '#334155', slate600: '#475569', slate500: '#64748B', slate400: '#94A3B8', slate300: '#CBD5E1', slate200: '#E2E8F0', slate100: '#F1F5F9', slate50: '#F8FAFC', white: '#FFFFFF', black: '#000000', success: '#16A34A', warning: '#D97706', error: '#DC2626', info: '#2563EB' } as const;
export const lightColors = { background: palette.slate50, surface: palette.white, surfaceElevated: palette.white, text: palette.slate900, textSecondary: palette.slate600, textMuted: palette.slate400, border: palette.slate200, primary: palette.spartanRed, primaryDark: palette.spartanRedDark, accent: palette.spartanGold, success: palette.success, warning: palette.warning, error: palette.error, info: palette.info, tabBar: palette.white, tabBarBorder: palette.slate200 } as const;
export const darkColors = { background: palette.slate900, surface: palette.slate800, surfaceElevated: palette.slate700, text: palette.slate50, textSecondary: palette.slate300, textMuted: palette.slate500, border: palette.slate700, primary: palette.spartanRed, primaryDark: palette.spartanRedDark, accent: palette.spartanGold, success: palette.success, warning: palette.warning, error: palette.error, info: palette.info, tabBar: palette.slate800, tabBarBorder: palette.slate700 } as const;
export type ColorScheme = typeof lightColors;
```

### src/theme/typography.ts
```typescript
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36 } as const;
export const lineHeight = { tight: 1.2, normal: 1.5, relaxed: 1.75 } as const;
export const typography = { h1: { fontSize: fontSize['3xl'], fontWeight: '700' as const, lineHeight: fontSize['3xl'] * lineHeight.tight }, h2: { fontSize: fontSize['2xl'], fontWeight: '700' as const, lineHeight: fontSize['2xl'] * lineHeight.tight }, h3: { fontSize: fontSize.xl, fontWeight: '600' as const, lineHeight: fontSize.xl * lineHeight.tight }, body: { fontSize: fontSize.md, fontWeight: '400' as const, lineHeight: fontSize.md * lineHeight.normal }, bodySmall: { fontSize: fontSize.sm, fontWeight: '400' as const, lineHeight: fontSize.sm * lineHeight.normal }, caption: { fontSize: fontSize.xs, fontWeight: '400' as const, lineHeight: fontSize.xs * lineHeight.normal }, label: { fontSize: fontSize.sm, fontWeight: '600' as const, lineHeight: fontSize.sm * lineHeight.normal }, button: { fontSize: fontSize.md, fontWeight: '600' as const, lineHeight: fontSize.md * lineHeight.tight } };
```

### src/theme/spacing.ts
```typescript
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 } as const;
export const borderRadius = { sm: 4, md: 8, lg: 12, xl: 16, full: 9999 } as const;
export const shadows = { sm: '0 1px 2px rgba(0,0,0,0.05)', md: '0 2px 4px rgba(0,0,0,0.1)', lg: '0 4px 8px rgba(0,0,0,0.15)' } as const;
```

### src/theme/index.ts
```typescript
export * from './colors'; export * from './typography'; export * from './spacing';
export type ThemeMode = 'light' | 'dark' | 'system';
export interface Theme { mode: 'light' | 'dark'; colors: ColorScheme; typography: typeof typography; spacing: typeof spacing; borderRadius: typeof borderRadius; shadows: typeof shadows; }
export function createTheme(mode: 'light' | 'dark'): Theme { return { mode, colors: mode === 'dark' ? darkColors : lightColors, typography, spacing, borderRadius, shadows }; }
```

### src/guards/role-guard.ts
```typescript
import { Role, Permission, hasPermission, hasMinimumRole, hasAllPermissions, hasAnyPermission } from '@spartan-g/shared-types';
export interface RoleGuardConfig { role: Role | null; requiredRole?: Role; requiredPermission?: Permission; requiredPermissions?: Permission[]; requireAll?: boolean; }
export function evaluateRoleGuard(config: RoleGuardConfig): boolean {
  const { role, requiredRole, requiredPermission, requiredPermissions, requireAll = false } = config;
  if (!role) return false;
  if (requiredRole && !hasMinimumRole(role, requiredRole)) return false;
  if (requiredPermission && !hasPermission(role, requiredPermission)) return false;
  if (requiredPermissions?.length) return requireAll ? hasAllPermissions(role, requiredPermissions) : hasAnyPermission(role, requiredPermissions);
  return true;
}
```

---

## 17. FIRESTORE SECURITY RULES

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helpers
    function isAuthenticated() { return request.auth != null; }
    function userDoc() { return get(/databases/$(database)/documents/users/$(request.auth.uid)); }
    function isActiveUser() { return isAuthenticated() && userDoc().data.isActive == true; }
    function userRole() { return userDoc().data.role; }
    function isStudent() { return isActiveUser() && userRole() == 'student'; }
    function isFacilitator() { return isActiveUser() && userRole() == 'facilitator'; }
    function isSuperAdmin() { return isActiveUser() && userRole() == 'super_admin'; }
    function isFacilitatorOrAdmin() { return isFacilitator() || isSuperAdmin(); }
    function isOwner(uid) { return isAuthenticated() && request.auth.uid == uid; }

    // Collections (summarized):
    // users:         read: owner/facilitator+admin, create: self as student, update: self (no role change) / admin, delete: admin
    // profiles:      read: owner/facilitator+admin, create/update: owner/admin, delete: admin
    // courses:       read: active users (published) / facilitator+admin, write: facilitator+admin
    // enrollments:   read: student self/facilitator+admin, create: self, update: facilitator+admin/self, delete: facilitator+admin
    // assignments:   read: active users, write: facilitator+admin
    // submissions:   read: self/facilitator+admin, create: self, update: facilitator+admin (can set score)/self (no score), delete: facilitator+admin
    // notifications: read/update: owner, create: facilitator+admin, delete: owner/admin
    // device_tokens: read: owner/admin, create/update: self, delete: owner/admin
    // announcements: read: active users/role-match, write: facilitator+admin
    // audit_logs:    read: admin, create: facilitator+admin, update/delete: false
    // risk_alerts:   read: facilitator+admin/self, create/update: facilitator+admin, delete: admin
    // appointments:  read: facilitator+admin/self, create/update/delete: facilitator+admin
    // conversations: read/update: participants, create: participants include self, delete: admin
    // messages:      read: active, create: self, update: self sender, delete: admin
    // work_hours_schedules: read: facilitator+admin, create/update/delete: facilitator (self)
  }
}
```

---

## 18. SEARCH FOR "assessment", "quiz", "attempt", "exam"

**No files found** — there are zero assessment-related files, types, or references anywhere in the project. This feature does not exist yet and must be created from scratch.

---

## 19. CSS/STYLING SUMMARY

### Web (Tailwind CSS v4)
- **Engine**: Tailwind CSS v4 via `@tailwindcss/vite` plugin
- **Entry**: `@import "tailwindcss"` in `global.css` — no config file needed (Tailwind v4 auto-detects)
- **Theme**: Uses standard Tailwind utility classes:
  - Colors: `indigo-600`, `indigo-50`, `gray-900`, `gray-600`, `gray-500`, `red-50`, `red-200`, `red-700`, `red-600`, `white`
  - Layout: `min-h-screen`, `flex`, `items-center`, `justify-center`, `space-y-*`, `space-x-*`
  - Background: `bg-gradient-to-br from-indigo-50 via-white to-purple-50`, `bg-gray-50`, `bg-white`, `bg-red-50`, `bg-indigo-100`, `bg-indigo-600`
  - Border: `rounded-lg`, `rounded-xl`, `border`, `border-2 border-dashed`, `shadow-sm`, `shadow-lg`, `ring-1 ring-gray-200`
  - Text: `text-sm`, `text-xs`, `text-lg`, `text-xl`, `text-3xl`, `font-medium`, `font-semibold`, `font-bold`, `tracking-tight`
  - Spacing: `px-4`, `py-8`, `p-3`, `p-8`, `p-12`, `space-y-5`, `space-y-4`, `space-y-8`
  - Responsive: `sm:px-6`, `lg:px-8`

### Mobile (React Native StyleSheet)
- **Engine**: React Native `StyleSheet.create()` with no third-party CSS library
- **Theme**: Uses `lightColors` from `@spartan-g/shared-ui` for colors
- **Pattern**: Inline `StyleSheet.create({...})` at bottom of each component file
- **Colors**: `lightColors.primary`, `lightColors.textMuted`, `lightColors.textSecondary`, `lightColors.background`, etc.
- **Font**: System default (no custom fonts configured)
- **Layout**: `flex: 1`, `alignItems: 'center'`, `justifyContent: 'center'`, `gap: 8`

---

## 20. KEY ARCHITECTURAL NOTES

1. **Data flow**: `UI Components → Zustand Stores → Services → Repositories → Firebase`
2. **Web uses its own auth context** (`useAuth.tsx` + `lib/auth.ts`) — NOT the shared `useAuthStore`. This means web and mobile have separate auth implementations.
3. **Mobile uses shared Zustand store** (`useAuthStore` from `@spartan-g/shared-services`)
4. **All routes are currently placeholders** — every portal page shows either `DashboardPage` (with "Coming Soon") or `PlaceholderPage`/`PlaceholderScreen`
5. **New features need**:
   - Shared types in `shared-types/src/constants/` and `shared-types/src/types/`
   - Firestore repository in `shared-services/src/repositories/`
   - Service layer in `shared-services/src/services/`
   - Web pages in `apps/web/src/pages/` + routes in `apps/web/src/navigation/`
   - Mobile screens in new `apps/mobile/src/screens/` directory (currently doesn't exist)
   - Navigation integration in mobile `StudentNavigator.tsx` or `FacilitatorNavigator.tsx`
6. **No assessment/quiz types exist anywhere** — must be created as new entities