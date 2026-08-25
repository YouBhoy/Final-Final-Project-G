import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { AuthSession, AuthStatus, LoginFormData, RegisterFormData } from "@spartan-g/shared-types";
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

  useEffect(() => {
    const unsubscribe = onAuthChange((authUser) => {
      if (authUser) {
        setUser(authUser);
        setStatus("authenticated");
      } else {
        setUser(null);
        setStatus("unauthenticated");
      }
    });

    return unsubscribe;
  }, []);

  const register = useCallback(async (data: RegisterFormData) => {
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
      setUser(authUser);
      setStatus("authenticated");
    } catch (err) {
      setStatus("unauthenticated");
      setError(err instanceof Error ? err.message : "Registration failed");
      throw err;
    }
  }, []);

  const login = useCallback(async (data: LoginFormData) => {
    setStatus("loading");
    setError(null);
    try {
      const authUser = await loginUser(data.email, data.password);
      setUser(authUser);
      setStatus("authenticated");
    } catch (err) {
      setStatus("unauthenticated");
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      await logoutUser();
      setUser(null);
      setStatus("unauthenticated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");
      setStatus("authenticated");
      throw err;
    }
  }, []);

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