import { Routes, Route, Navigate } from "react-router-dom";
import { PortalLayout } from "../components/layout/PortalLayout";
import { PlaceholderPage } from "../components/PlaceholderPage";
import { AssessmentTemplatesPage } from "../pages/admin/AssessmentTemplatesPage";
import { TemplateFormPage } from "../pages/admin/TemplateFormPage";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage";
import { AdminUserDetailPage } from "../pages/admin/AdminUserDetailPage";
import { AdminResourcesPage } from "../pages/admin/AdminResourcesPage";
import { AdminAuditLogsPage } from "../pages/admin/AdminAuditLogsPage";
import { AdminProfilePage } from "../pages/admin/AdminProfilePage";
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
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="users/:uid" element={<AdminUserDetailPage />} />
        <Route path="assessment-templates" element={<AssessmentTemplatesPage />} />
        <Route path="assessment-templates/new" element={<TemplateFormPage />} />
        <Route path="assessment-templates/:id/edit" element={<TemplateFormPage />} />
        <Route path="resources" element={<AdminResourcesPage />} />
        <Route path="audit-logs" element={<AdminAuditLogsPage />} />
        <Route path="profile" element={<AdminProfilePage />} />
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
