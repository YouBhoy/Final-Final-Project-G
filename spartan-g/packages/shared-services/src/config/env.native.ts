import type { EnvConfig, AppEnvironment } from './env.shared';
import { resolveDeploymentTarget } from './env.shared';

function getFirebaseConfig(): EnvConfig['firebase'] {
  // Direct property access - required for Expo production builds
  // which only replace static process.env.EXPO_PUBLIC_* references at build time
  return {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '',
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || process.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
  };
}

function getAppEnv(): AppEnvironment {
  const env = process.env.EXPO_PUBLIC_APP_ENV || process.env.VITE_APP_ENV || 'development';
  if (env === 'development' || env === 'staging' || env === 'production') {
    return env;
  }
  return 'development';
}

const appEnv = getAppEnv();

const firebaseConfig = getFirebaseConfig();

// Validate required fields
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'] as const;
for (const field of requiredFields) {
  if (!firebaseConfig[field]) {
    throw new Error(
      `Missing required Firebase configuration: ${field}. ` +
      'Ensure EXPO_PUBLIC_FIREBASE_* environment variables are set in apps/mobile/.env'
    );
  }
}

export const env: EnvConfig = {
  appEnv,
  isDev: appEnv === 'development',
  isProd: appEnv === 'production',
  firebase: firebaseConfig,
  eas: {
    projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? undefined,
  },
};

export { resolveDeploymentTarget };