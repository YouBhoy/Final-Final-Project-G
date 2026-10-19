import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Web and other nonnative consumers retain their existing SDK defaults.
export function getPlatformAuth(app: FirebaseApp) {
  return getAuth(app);
}
