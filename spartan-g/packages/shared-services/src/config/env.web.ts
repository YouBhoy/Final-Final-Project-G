import type { EnvConfig, AppEnvironment } from './env.shared';
import { resolveDeploymentTarget } from './env.shared';

function optionalEnv(key: string): string | undefined {
  const processVal = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (processVal) return processVal;
  const metaVal = import.meta.env?.[key];
  return metaVal || undefined;
}

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = optionalEnv(key);
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: one of ${keys.join(', ')}`);
}

function getAppEnv(): AppEnvironment {
  const env = optionalEnv('VITE_APP_ENV') ?? optionalEnv('EXPO_PUBLIC_APP_ENV') ?? 'development';
  if (env === 'development' || env === 'staging' || env === 'production') {
    return env;
  }
  return 'development';
}

const appEnv = getAppEnv();

export const env: EnvConfig = {
  appEnv,
  isDev: appEnv === 'development',
  isProd: appEnv === 'production',
  firebase: {
    apiKey: requireEnv('VITE_FIREBASE_API_KEY', 'EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: requireEnv('VITE_FIREBASE_PROJECT_ID', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET', 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requireEnv('VITE_FIREBASE_APP_ID', 'EXPO_PUBLIC_FIREBASE_APP_ID'),
    measurementId: optionalEnv('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID') ?? optionalEnv('VITE_FIREBASE_MEASUREMENT_ID'),
  },
  eas: {
    projectId: optionalEnv('EXPO_PUBLIC_EAS_PROJECT_ID'),
  },
};

export { resolveDeploymentTarget };