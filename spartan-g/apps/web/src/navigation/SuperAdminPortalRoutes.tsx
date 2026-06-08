import { Routes, Route } from 'react-router-dom';
import { PlaceholderPage } from '../components/PlaceholderPage';

/** Super Admin is web-only — no mobile counterpart */
export function SuperAdminPortalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PlaceholderPage title="Admin Dashboard" portal="Super Admin Web Portal" />} />
      <Route path="/users" element={<PlaceholderPage title="User Management" portal="Super Admin Web Portal" />} />
      <Route path="/users/:userId" element={<PlaceholderPage title="User Detail" portal="Super Admin Web Portal" />} />
      <Route path="/analytics" element={<PlaceholderPage title="System Analytics" portal="Super Admin Web Portal" />} />
      <Route path="/settings" element={<PlaceholderPage title="Platform Settings" portal="Super Admin Web Portal" />} />
      <Route path="/audit-logs" element={<PlaceholderPage title="Audit Logs" portal="Super Admin Web Portal" />} />
    </Routes>
  );
}
