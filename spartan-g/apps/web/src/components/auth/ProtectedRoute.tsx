import { Navigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import type { Role } from "../../types/auth.types";
import type { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: Role[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, status } = useAuth();

  // Still loading auth state
  if (status === "idle" || status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <svg
            className="animate-spin h-8 w-8 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (status === "unauthenticated" || !user) {
    return <Navigate to="/login" replace />;
  }

  // Wrong role — redirect to their correct dashboard
  if (!allowedRoles.includes(user.role)) {
    const redirectMap: Record<Role, string> = {
      student: "/student/dashboard",
      facilitator: "/facilitator/dashboard",
      super_admin: "/admin/dashboard",
    };
    return <Navigate to={redirectMap[user.role]} replace />;
  }

  return <>{children}</>;
}