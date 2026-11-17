import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/global.css';
import './styles/portal-glass.css';

try {
  window.localStorage.removeItem('spartan-g-theme');
} catch {
  // Storage may be unavailable; theme selection is no longer persisted.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
