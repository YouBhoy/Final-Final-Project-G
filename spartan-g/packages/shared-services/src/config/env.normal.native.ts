// Normal native configuration. Kept in parity tests with env.native.ts's non-local path.
// Static EXPO_PUBLIC accesses preserve Expo's existing build-time substitution.
import type { EnvConfig, AppEnvironment } from './env.shared';
import { resolveDeploymentTarget } from './env.shared';
import { Platform } from 'react-native';
import { resolveNativeFirebaseAppId } from './firebase-app-id';
const firebaseConfig: EnvConfig['firebase'] = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || process.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};
firebaseConfig.appId = resolveNativeFirebaseAppId(Platform.OS, firebaseConfig.projectId, firebaseConfig.appId);
function getAppEnv(): AppEnvironment {
  const value = process.env.EXPO_PUBLIC_APP_ENV || process.env.VITE_APP_ENV || 'development';
  return value === 'development' || value === 'staging' || value === 'production' ? value : 'development';
}
for (const field of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'] as const) {
  if (!firebaseConfig[field]) throw new Error(`Missing required Firebase configuration: ${field}. Ensure EXPO_PUBLIC_FIREBASE_* environment variables are set in apps/mobile/.env`);
}
const appEnv = getAppEnv();
export const env: EnvConfig = { appEnv, isDev: appEnv === 'development', isProd: appEnv === 'production',
  firebase: firebaseConfig, eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? undefined } };
export { resolveDeploymentTarget };
