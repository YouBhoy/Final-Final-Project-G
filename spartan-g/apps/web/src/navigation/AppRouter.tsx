import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { AssessmentWizardPage } from "../pages/assessment/AssessmentWizardPage";
import { TemplateAssessmentPage } from "../pages/assessment/TemplateAssessmentPage";
import { StudentAssessmentsPage } from "../pages/student/StudentAssessmentsPage";
import { SeederPage } from "../pages/dev/SeederPage";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { StudentPortalRoutes } from "./StudentPortalRoutes";
import { FacilitatorPortalRoutes } from "./FacilitatorPortalRoutes";
import { SuperAdminPortalRoutes } from "./SuperAdminPortalRoutes";
import type { ReactNode } from "react";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600">
          <span className="text-xl font-bold text-white">SG</span>
        </div>
        <div className="flex items-center space-x-2">
          <svg
            className="animate-spin h-5 w-5 text-indigo-600"
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
          <p className="text-sm text-gray-500">Loading SPARTAN-G...</p>
        </div>
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "idle" || status === "loading") {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public auth routes — redirect to dashboard if already logged in */}
      <Route
        path="/login"
        element={
          user ? (
            <Navigate
              to={
                user.role === "student"
                  ? "/student/dashboard"
                  : user.role === "facilitator"
                  ? "/facilitator/dashboard"
                  : "/admin/dashboard"
              }
              replace
            />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        path="/register"
        element={
          user ? (
            <Navigate
              to={
                user.role === "student"
                  ? "/student/dashboard"
                  : user.role === "facilitator"
                  ? "/facilitator/dashboard"
                  : "/admin/dashboard"
              }
              replace
            />
          ) : (
            <RegisterPage />
          )
        }
      />
      <Route
        path="/forgot-password"
        element={
          user ? (
            <Navigate
              to={
                user.role === "student"
                  ? "/student/dashboard"
                  : user.role === "facilitator"
                  ? "/facilitator/dashboard"
                  : "/admin/dashboard"
              }
              replace
            />
          ) : (
            <ForgotPasswordPage />
          )
        }
      />

      {/* Student portal — role-gated, with sidebar layout */}
      <Route
        path="/student/*"
        element={
          <ProtectedRoute allowedRoles={["student"]}>
            <StudentPortalRoutes />
          </ProtectedRoute>
        }
      />

      {/* Facilitator portal — role-gated, with its own layout */}
      <Route
        path="/facilitator/*"
        element={
          <ProtectedRoute allowedRoles={["facilitator"]}>
            <FacilitatorPortalRoutes />
          </ProtectedRoute>
        }
      />

      {/* Super Admin portal — role-gated, with its own layout */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={["super_admin"]}>
            <SuperAdminPortalRoutes />
          </ProtectedRoute>
        }
      />

      {/* Dev routes */}
      <Route path="/dev/seed" element={<SeederPage />} />

      {/* Default redirect */}
      <Route
        path="*"
        element={
          user ? (
            <Navigate
              to={
                user.role === "student"
                  ? "/student/dashboard"
                  : user.role === "facilitator"
                  ? "/facilitator/dashboard"
                  : "/admin/dashboard"
              }
              replace
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
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