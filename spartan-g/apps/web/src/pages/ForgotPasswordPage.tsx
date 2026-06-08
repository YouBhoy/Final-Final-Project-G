import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/auth/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";

export function ForgotPasswordPage() {
  const { forgotPassword, error, clearError } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [isSent, setIsSent] = useState(false);
  const [formError, setFormError] = useState("");

  function validate(): boolean {
    if (!email.trim()) {
      setFormError("Email is required");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Invalid email address");
      return false;
    }
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setFormError("");

    if (!validate()) return;

    setIsLoading(true);
    try {
      await forgotPassword(email);
      setIsSent(true);
    } catch {
      // Error is set in auth context
    } finally {
      setIsLoading(false);
    }
  }

  if (isSent) {
    return (
      <AuthLayout title="Check your email" subtitle="Password reset link sent">
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-600">
            We've sent a password reset link to <strong>{email}</strong>.
            Please check your inbox and follow the instructions.
          </p>
          <p className="text-xs text-gray-500">
            Didn't receive the email? Check your spam folder or{" "}
            <button
              onClick={() => {
                setIsSent(false);
                setEmail("");
              }}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              try again
            </button>
          </p>
          <Link
            to="/login"
            className="inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email address">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Error banner */}
        {(error || formError) && (
          <div
            className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
            role="alert"
          >
            {formError || error}
          </div>
        )}

        <p className="text-sm text-gray-600">
          Enter the email address associated with your account and we'll
          send you a link to reset your password.
        </p>

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFormError("");
          }}
          error={formError}
          autoComplete="email"
          disabled={isLoading}
        />

        <Button type="submit" isLoading={isLoading} className="w-full">
          Send reset link
        </Button>

        <p className="text-center text-sm text-gray-600">
          Remember your password?{" "}
          <Link
            to="/login"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}