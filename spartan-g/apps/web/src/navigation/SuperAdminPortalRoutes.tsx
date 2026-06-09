import { Routes, Route, Navigate } from "react-router-dom";
import { PortalLayout } from "../components/layout/PortalLayout";
import { PlaceholderPage } from "../components/PlaceholderPage";
import { adminNavItems } from "./navConfigs";

/** Super Admin is web-only — no mobile counterpart. */
export function SuperAdminPortalRoutes() {
  return (
    <PortalLayout
      portalName="Super Admin Portal"
      portalTagline="Manage the SPARTAN-G platform"
      navItems={adminNavItems}
    >
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <PlaceholderPage
              title="Admin Dashboard"
              description="Platform-wide health, usage, and key metrics."
            />
          }
        />
        <Route
          path="users"
          element={
            <PlaceholderPage
              title="User Management"
              description="Manage students, facilitators, and admin accounts."
            />
          }
        />
        <Route
          path="assessment-templates"
          element={
            <PlaceholderPage
              title="Assessment Templates"
              description="Create, edit, and version assessment instruments."
            />
          }
        />
        <Route
          path="resources"
          element={
            <PlaceholderPage
              title="Resources"
              description="Curate the global resource library available to all users."
            />
          }
        />
        <Route
          path="settings"
          element={
            <PlaceholderPage
              title="Platform Settings"
              description="Configure system-wide preferences and integrations."
            />
          }
        />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PortalLayout>
  );
}
