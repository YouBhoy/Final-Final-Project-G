import { Routes, Route, Navigate } from "react-router-dom";
import { PortalLayout } from "../components/layout/PortalLayout";
import { PlaceholderPage } from "../components/PlaceholderPage";
import { FacilitatorAssessmentsPage } from "../pages/facilitator/FacilitatorAssessmentsPage";
import { FacilitatorStudentsPage } from "../pages/facilitator/FacilitatorStudentsPage";
import { FacilitatorRiskAlertsPage } from "../pages/facilitator/FacilitatorRiskAlertsPage";
import { FacilitatorAppointmentsPage } from "../pages/facilitator/FacilitatorAppointmentsPage";
import { FacilitatorWorkHoursPage } from "../pages/facilitator/FacilitatorWorkHoursPage";
import { FacilitatorMessagesPage } from "../pages/messaging/FacilitatorMessagesPage";
import { FacilitatorProfilePage } from "../pages/facilitator/FacilitatorProfilePage";
import { FacilitatorDashboardPage } from "../pages/facilitator/FacilitatorDashboardPage";
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
          element={<FacilitatorDashboardPage />}
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
          element={<FacilitatorAppointmentsPage />}
        />
        <Route
          path="work-hours"
          element={<FacilitatorWorkHoursPage />}
        />
        <Route path="messages" element={<FacilitatorMessagesPage />} />
        <Route
          path="resources"
          element={
            <PlaceholderPage
              title="Resources"
              description="Curated resources you can share with students."
            />
          }
        />
        <Route path="profile" element={<FacilitatorProfilePage />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PortalLayout>
  );
}
