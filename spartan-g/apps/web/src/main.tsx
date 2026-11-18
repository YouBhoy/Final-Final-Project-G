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

async function removeLegacyFirestorePersistence() {
  if (!('databases' in indexedDB)) return;
  try {
    const databases = await indexedDB.databases();
    await Promise.all(databases
      .filter(database => typeof database.name === 'string'
        && (database.name.startsWith('firestore') || database.name.includes('/firestore/')))
      .map(database => new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(database.name!);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      })));
  } catch {
    // Storage cleanup is best-effort; Firestore is configured with memory-only cache.
  }
}

void removeLegacyFirestorePersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
