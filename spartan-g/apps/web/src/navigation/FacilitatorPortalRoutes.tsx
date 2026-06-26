import { Routes, Route, Navigate } from "react-router-dom";
import { PortalLayout } from "../components/layout/PortalLayout";
import { PlaceholderPage } from "../components/PlaceholderPage";
import { FacilitatorAssessmentsPage } from "../pages/facilitator/FacilitatorAssessmentsPage";
import { FacilitatorStudentsPage } from "../pages/facilitator/FacilitatorStudentsPage";
import { FacilitatorRiskAlertsPage } from "../pages/facilitator/FacilitatorRiskAlertsPage";
import { facilitatorNavItems } from "./navConfigs";

export function FacilitatorPortalRoutes() {
  return (
    <PortalLayout
      portalName="Facilitator Portal"
      portalTagline="Support your students' wellbeing"
      navItems={facilitatorNavItems}
    >
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <PlaceholderPage
              title="Dashboard"
              description="Overview of caseload, alerts, and upcoming sessions."
            />
          }
        />
        <Route
          path="students"
          element={<FacilitatorStudentsPage />}
        />
        <Route
          path="assessments"
          element={<FacilitatorAssessmentsPage />}
        />
        <Route
          path="risk-alerts"
          element={<FacilitatorRiskAlertsPage />}
        />
        <Route
          path="referrals"
          element={
            <PlaceholderPage
              title="Referrals"
              description="Create and track referrals to specialist support."
            />
          }
        />
        <Route
          path="appointments"
          element={
            <PlaceholderPage
              title="Appointments"
              description="Schedule and review appointments with students."
            />
          }
        />
        <Route
          path="resources"
          element={
            <PlaceholderPage
              title="Resources"
              description="Curated resources you can share with students."
            />
          }
        />
        <Route
          path="profile"
          element={
            <PlaceholderPage
              title="Profile"
              description="Manage your profile and availability."
            />
          }
        />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PortalLayout>
  );
}
