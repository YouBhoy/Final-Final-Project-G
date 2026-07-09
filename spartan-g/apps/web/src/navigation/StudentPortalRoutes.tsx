import { Routes, Route, Navigate } from "react-router-dom";
import { PortalLayout } from "../components/layout/PortalLayout";
import { PlaceholderPage } from "../components/PlaceholderPage";
import { StudentAssessmentsPage } from "../pages/student/StudentAssessmentsPage";
import { AssessmentWizardPage } from "../pages/assessment/AssessmentWizardPage";
import { StudentMessagesPage } from "../pages/messaging/StudentMessagesPage";
import { StudentAppointmentsPage } from "../pages/student/StudentAppointmentsPage";
import { StudentFindFacilitatorPage } from "../pages/student/StudentFindFacilitatorPage";
import { StudentBookAppointmentPage } from "../pages/student/StudentBookAppointmentPage";
import { DashboardPage } from "../pages/DashboardPage";
import { studentNavItems } from "./navConfigs";

export function StudentPortalRoutes() {
  return (
    <PortalLayout
      portalName="Student Portal"
      portalTagline="Track your wellbeing journey"
      navItems={studentNavItems}
    >
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <DashboardPage
              title="Student Dashboard"
              portalName="Student Portal"
            />
          }
        />
        <Route
          path="facilitators"
          element={<StudentFindFacilitatorPage />}
        />
        <Route
          path="facilitator/:facilitatorId"
          element={<StudentBookAppointmentPage />}
        />
        <Route
          path="appointments"
          element={<StudentAppointmentsPage />}
        />
        <Route
          path="assessments"
          element={<StudentAssessmentsPage />}
        />
        <Route
          path="assessment/:assessmentId"
          element={<AssessmentWizardPage />}
        />
        <Route
          path="checkins"
          element={
            <PlaceholderPage
              title="Check-ins"
              description="Daily and weekly self-reported check-ins."
            />
          }
        />
        <Route
          path="resources"
          element={
            <PlaceholderPage
              title="Resources"
              description="Curated articles, videos, and self-help materials."
            />
          }
        />
        <Route path="messages" element={<StudentMessagesPage />} />
        <Route
          path="profile"
          element={
            <PlaceholderPage
              title="Profile"
              description="Manage your personal information and preferences."
            />
          }
        />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PortalLayout>
  );
}
