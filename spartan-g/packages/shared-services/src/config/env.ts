import type { EnvConfig, AppEnvironment } from './env.shared';
import { resolveDeploymentTarget } from './env.shared';

/**
 * IMPORTANT: Expo/Metro only performs static replacement of process.env.EXPO_PUBLIC_*
 * at build time when using DIRECT property access (e.g., process.env.EXPO_PUBLIC_FOO).
 * Computed/dynamic access (e.g., process.env[`EXPO_PUBLIC_${key}`]) will NOT work
 * in production APK builds and will return undefined, causing a crash.
 * 
 * Each env var must be accessed explicitly.
 */

function getAppEnv(): AppEnvironment {
  const env =
    process.env.EXPO_PUBLIC_APP_ENV ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_ENV) ||
    'development';
  if (env === 'development' || env === 'staging' || env === 'production') {
    return env;
  }
  return 'development';
}

function optional(key: string): string | undefined {
  // Try VITE_ prefix via import.meta.env (Vite/web)
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      const viteKey = `VITE_${key}`;
      const viteVal = (import.meta.env as Record<string, unknown>)[viteKey];
      if (typeof viteVal === 'string' && viteVal) return viteVal;
    }
  } catch {}
  // Fallback to process.env for Metro/Expo (already handled) or Node
  // @ts-expect-error - process.env accessed
  return process.env[`VITE_${key}`] || undefined;
}

const appEnv = getAppEnv();

/**
 * WARNING: Every EXPO_PUBLIC_* access uses Direct Property Access
 * (process.env.EXPO_PUBLIC_XXXX) not computed access, to ensure
 * Expo/Metro statically replaces them at APK build time.
 */

export const env: EnvConfig = {
  appEnv,
  isDev: appEnv === 'development',
  isProd: appEnv === 'production',
  firebase: {
    apiKey:
      process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
      optional('FIREBASE_API_KEY') ||
      (() => { throw new Error('Missing FIREBASE_API_KEY'); })(),
    authDomain:
      process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
      optional('FIREBASE_AUTH_DOMAIN') ||
      (() => { throw new Error('Missing FIREBASE_AUTH_DOMAIN'); })(),
    projectId:
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
      optional('FIREBASE_PROJECT_ID') ||
      (() => { throw new Error('Missing FIREBASE_PROJECT_ID'); })(),
    storageBucket:
      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      optional('FIREBASE_STORAGE_BUCKET') ||
      (() => { throw new Error('Missing FIREBASE_STORAGE_BUCKET'); })(),
    messagingSenderId:
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
      optional('FIREBASE_MESSAGING_SENDER_ID') ||
      (() => { throw new Error('Missing FIREBASE_MESSAGING_SENDER_ID'); })(),
    appId:
      process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
      optional('FIREBASE_APP_ID') ||
      (() => { throw new Error('Missing FIREBASE_APP_ID'); })(),
    measurementId:
      process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ||
      optional('FIREBASE_MEASUREMENT_ID') ||
      undefined,
  },
  eas: {
    projectId:
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
      optional('EAS_PROJECT_ID') ||
      undefined,
  },
};

export { resolveDeploymentTarget };