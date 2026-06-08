import { Routes, Route } from 'react-router-dom';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function StudentPortalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PlaceholderPage title="Student Home" portal="Student Web Portal" />} />
      <Route path="/courses" element={<PlaceholderPage title="Courses" portal="Student Web Portal" />} />
      <Route path="/courses/:courseId" element={<PlaceholderPage title="Course Detail" portal="Student Web Portal" />} />
      <Route path="/assignments" element={<PlaceholderPage title="Assignments" portal="Student Web Portal" />} />
      <Route path="/assignments/:assignmentId" element={<PlaceholderPage title="Assignment Detail" portal="Student Web Portal" />} />
      <Route path="/messages" element={<PlaceholderPage title="Messages" portal="Student Web Portal" />} />
      <Route path="/messages/:conversationId" element={<PlaceholderPage title="Conversation" portal="Student Web Portal" />} />
      <Route path="/profile" element={<PlaceholderPage title="Profile" portal="Student Web Portal" />} />
    </Routes>
  );
}
