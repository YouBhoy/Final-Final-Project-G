import { Routes, Route } from 'react-router-dom';
import { PlaceholderPage } from '../components/PlaceholderPage';

export function AuthRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PlaceholderPage title="Login" />} />
      <Route path="/register" element={<PlaceholderPage title="Register" />} />
      <Route path="/forgot-password" element={<PlaceholderPage title="Forgot Password" />} />
      <Route path="/mobile-only-redirect" element={<PlaceholderPage title="Use Mobile App" />} />
    </Routes>
  );
}
