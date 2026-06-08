import { Routes, Route } from 'react-router-dom';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function FacilitatorPortalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PlaceholderPage title="Facilitator Dashboard" portal="Facilitator Web Portal" />} />
      <Route path="/courses" element={<PlaceholderPage title="Courses" portal="Facilitator Web Portal" />} />
      <Route path="/courses/:courseId" element={<PlaceholderPage title="Manage Course" portal="Facilitator Web Portal" />} />
      <Route path="/students" element={<PlaceholderPage title="Students" portal="Facilitator Web Portal" />} />
      <Route path="/risk-alerts" element={<PlaceholderPage title="Risk Alerts" portal="Facilitator Web Portal" />} />
      <Route path="/risk-alerts/:alertId" element={<PlaceholderPage title="Risk Alert Detail" portal="Facilitator Web Portal" />} />
      <Route path="/appointments" element={<PlaceholderPage title="Appointments" portal="Facilitator Web Portal" />} />
      <Route path="/appointments/:appointmentId" element={<PlaceholderPage title="Appointment Detail" portal="Facilitator Web Portal" />} />
      <Route path="/messages" element={<PlaceholderPage title="Messages" portal="Facilitator Web Portal" />} />
      <Route path="/messages/:conversationId" element={<PlaceholderPage title="Conversation" portal="Facilitator Web Portal" />} />
      <Route path="/work-hours" element={<PlaceholderPage title="Work Hours Schedule" portal="Facilitator Web Portal" />} />
      <Route path="/profile" element={<PlaceholderPage title="Profile" portal="Facilitator Web Portal" />} />
    </Routes>
  );
}
