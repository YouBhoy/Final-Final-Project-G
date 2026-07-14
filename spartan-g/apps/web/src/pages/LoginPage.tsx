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

  // Redirect if already logged in
  if (user) {
    return <Navigate to={getRoleRedirect(user.role)} replace />;
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Invalid email address";
    }

    if (!password) {
      errors.password = "Password is required";
    }

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
      // Navigation handled by redirect above
    } catch {
      // Error is set in auth context
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your student portal account">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Error banner */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={formErrors.email}
          autoComplete="email"
          disabled={isLoading}
          className="focus:!border-[var(--auth-primary)] focus:!ring-[var(--auth-primary)]"
        />

        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={formErrors.password}
          autoComplete="current-password"
          disabled={isLoading}
          showPasswordToggle
          className="focus:!border-[var(--auth-primary)] focus:!ring-[var(--auth-primary)]"
        />

        <div className="flex items-center justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-[var(--auth-primary)] hover:text-[var(--auth-primary-dark)]"
          >
            Forgot Password?
          </Link>
        </div>

        <Button
          type="submit"
          isLoading={isLoading}
          className="w-full !bg-[var(--auth-primary)] !text-white hover:!bg-[var(--auth-primary-dark)] focus:!ring-[var(--auth-primary)]"
        >
          Sign in
        </Button>

        <p className="text-center text-sm text-gray-600">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-[var(--auth-primary)] hover:text-[var(--auth-primary-dark)]"
          >
            Sign up
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}