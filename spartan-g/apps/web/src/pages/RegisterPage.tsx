import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthLayout } from "../components/auth/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { getRoleRedirect } from "../lib/auth";
import type { RegisterFormData, Role } from "../types/auth.types";

export function RegisterPage() {
  const { register, user, error, clearError } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // Redirect if already logged in
  if (user) {
    return <Navigate to={getRoleRedirect(user.role)} replace />;
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      errors.firstName = "First name is required";
    }

    if (!formData.lastName.trim()) {
      errors.lastName = "Last name is required";
    }

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Invalid email address";
    }

    if (!formData.password) {
      errors.password = "Password is required";
    } else if (formData.password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleChange(field: keyof RegisterFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();

    if (!validate()) return;

    setIsLoading(true);
    try {
      await register(formData);
      // Navigation handled by redirect above
    } catch {
      // Error is set in auth context
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join the student portal as a student"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Error banner */}
        {error && (
          <div
            className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            placeholder="John"
            value={formData.firstName}
            onChange={(e) => handleChange("firstName", e.target.value)}
            error={formErrors.firstName}
            autoComplete="given-name"
            disabled={isLoading}
            className="focus:!border-[var(--auth-primary)] focus:!ring-[var(--auth-primary)]"
          />
          <Input
            label="Last Name"
            placeholder="Doe"
            value={formData.lastName}
            onChange={(e) => handleChange("lastName", e.target.value)}
            error={formErrors.lastName}
            autoComplete="family-name"
            disabled={isLoading}
            className="focus:!border-[var(--auth-primary)] focus:!ring-[var(--auth-primary)]"
          />
        </div>

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          error={formErrors.email}
          autoComplete="email"
          disabled={isLoading}
          className="focus:!border-[var(--auth-primary)] focus:!ring-[var(--auth-primary)]"
        />

        {/* Role selector — testing only */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            I am a
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(["student", "facilitator"] as Role[]).map((role) => (
              <button
                key={role}
                type="button"
                disabled={isLoading}
                onClick={() =>
                  setFormData((prev) => ({ ...prev, role }))
                }
                className={`
                  rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors
                  ${
                    (formData.role || "student") === role
                      ? "border-red-700 bg-red-50 text-red-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {role === "student" ? "🎓 Student" : "🧑‍🏫 Facilitator"}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Password"
          type="password"
          placeholder="At least 6 characters"
          value={formData.password}
          onChange={(e) => handleChange("password", e.target.value)}
          error={formErrors.password}
          autoComplete="new-password"
          disabled={isLoading}
          className="focus:!border-[var(--auth-primary)] focus:!ring-[var(--auth-primary)]"
        />

        <Input
          label="Confirm Password"
          type="password"
          placeholder="Repeat your password"
          value={formData.confirmPassword}
          onChange={(e) => handleChange("confirmPassword", e.target.value)}
          error={formErrors.confirmPassword}
          autoComplete="new-password"
          disabled={isLoading}
          className="focus:!border-[var(--auth-primary)] focus:!ring-[var(--auth-primary)]"
        />

        <Button
          type="submit"
          isLoading={isLoading}
          className="w-full !bg-[var(--auth-primary)] !text-white hover:!bg-[var(--auth-primary-dark)] focus:!ring-[var(--auth-primary)]"
        >
          Create account
        </Button>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-[var(--auth-primary)] hover:text-[var(--auth-primary-dark)]"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}