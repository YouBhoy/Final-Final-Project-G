import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { AuthSession, AuthStatus, LoginFormData, RegisterFormData } from "@spartan-g/shared-types";
import { clearPrivacySession } from '../lib/privacySession';
import { setDashboardSession } from '../lib/dashboardRuntime';
import { clearPortalTabSession, monitorPortalIdle } from '../lib/adminTabSession';
import {
  registerUser,
  loginUser,
  logoutUser,
  resetPassword,
  onAuthChange,
} from "../lib/auth";

interface AuthContextValue {
  user: AuthSession | null;
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
  const [user, setUser] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const expirePortalSession = useCallback(() => {
    setDashboardSession(null);
    clearPortalTabSession();
    clearPrivacySession();
    setUser(null);
    setStatus('unauthenticated');
    setError('Your session expired after 15 minutes of inactivity. Sign in again.');
    // Keep the portal closed even if browser storage makes SDK sign-out fail.
    void logoutUser().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    return monitorPortalIdle(user.uid, expirePortalSession);
  }, [user?.uid, user?.role, expirePortalSession]);

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => {
      setDashboardSession(authUser);
      if (authUser) {
        setUser(authUser);
        setStatus("authenticated");
      } else {
        clearPrivacySession();
        setUser(null);
        setStatus("unauthenticated");
      }
    });

    return unsubscribe;
  }, []);

  const register = useCallback(async (data: RegisterFormData) => {
    setDashboardSession(null);
    clearPrivacySession();
    setStatus("loading");
    setError(null);
    try {
      const authUser = await registerUser(
        data.email,
        data.password,
        data.firstName,
        data.lastName,
        data.role,
        data.campus
      );
      setDashboardSession(authUser);
      setUser(authUser);
      setStatus("authenticated");
    } catch (err) {
      setStatus("unauthenticated");
      setError(err instanceof Error ? err.message : "Registration failed");
      throw err;
    }
  }, []);

  const login = useCallback(async (data: LoginFormData) => {
    setDashboardSession(null);
    clearPrivacySession();
    setStatus("loading");
    setError(null);
    try {
      const authUser = await loginUser(data.email, data.password);
      setDashboardSession(authUser);
      setUser(authUser);
      setStatus("authenticated");
    } catch (err) {
      setStatus("unauthenticated");
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    setDashboardSession(null);
    clearPrivacySession();
    setStatus("loading");
    setError(null);
    try {
      await logoutUser();
      setUser(null);
      setStatus("unauthenticated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");
      // Restore only the known portal scope; the next read still checks the server.
      setDashboardSession(user);
      setStatus("authenticated");
      throw err;
    }
  }, [user]);

  const forgotPassword = useCallback(async (email: string) => {
    setError(null);
    try {
      await resetPassword(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{ user, status, error, register, login, logout, forgotPassword, clearError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
