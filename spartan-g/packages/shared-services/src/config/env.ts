import { DeploymentTarget } from '@spartan-g/shared-types';

type AppEnvironment = 'development' | 'staging' | 'production';

interface EnvConfig {
  appEnv: AppEnvironment;
  isDev: boolean;
  isProd: boolean;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
  };
  eas: {
    projectId?: string;
  };
}

function optionalEnv(key: string): string | undefined {
  const processVal = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (processVal) return processVal;
  const metaVal =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: Record<string, string> }).env?.[key]
      : undefined;
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
  const env = optionalEnv('EXPO_PUBLIC_APP_ENV') ?? optionalEnv('VITE_APP_ENV') ?? 'development';
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
    apiKey: requireEnv('EXPO_PUBLIC_FIREBASE_API_KEY', 'VITE_FIREBASE_API_KEY'),
    authDomain: requireEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: requireEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_PROJECT_ID'),
    storageBucket: requireEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requireEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID', 'VITE_FIREBASE_APP_ID'),
    measurementId: optionalEnv('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID') ?? optionalEnv('VITE_FIREBASE_MEASUREMENT_ID'),
  },
  eas: {
    projectId: optionalEnv('EXPO_PUBLIC_EAS_PROJECT_ID'),
  },
};

export function resolveDeploymentTarget(
  platform: 'mobile' | 'web',
  role: string | null,
): DeploymentTarget | null {
  if (!role) return null;
  if (platform === 'mobile') {
    if (role === 'student') return 'student_mobile';
    if (role === 'facilitator') return 'facilitator_mobile';
    return null;
  }
  if (role === 'student') return 'student_web';
  if (role === 'facilitator') return 'facilitator_web';
  if (role === 'super_admin') return 'super_admin_web';
  return null;
}
