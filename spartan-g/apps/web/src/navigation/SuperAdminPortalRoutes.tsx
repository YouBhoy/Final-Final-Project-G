import { Routes, Route, Navigate } from "react-router-dom";
import { PortalLayout } from "../components/layout/PortalLayout";
import { PlaceholderPage } from "../components/PlaceholderPage";
import { AdminCampusesPage } from "../pages/admin/AdminCampusesPage";
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
        <Route
          path="statistics"
          element={
            <PlaceholderPage
              title="Statistics"
              description="Assessment participation, completion rates, and wellbeing trends across campuses."
              iconPath="M3 3v18h18M7 16v-4m5 4V8m5 8V5"
            />
          }
        />
        <Route path="users/:uid" element={<AdminUserDetailPage />} />
        <Route path="campuses" element={<AdminCampusesPage />} />
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
