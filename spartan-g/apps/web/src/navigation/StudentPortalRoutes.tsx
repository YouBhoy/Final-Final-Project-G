import { Routes, Route, Navigate } from "react-router-dom";
import { PortalLayout } from "../components/layout/PortalLayout";
import { PlaceholderPage } from "../components/PlaceholderPage";
import { StudentAssessmentsPage } from "../pages/student/StudentAssessmentsPage";
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
            <PlaceholderPage
              title="Dashboard"
              description="Overview of your wellbeing, upcoming check-ins, and recent activity."
            />
          }
        />
        <Route
          path="assessments"
          element={<StudentAssessmentsPage />}
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
        <Route
          path="appointments"
          element={
            <PlaceholderPage
              title="Appointments"
              description="Schedule and manage appointments with facilitators."
            />
          }
        />
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
