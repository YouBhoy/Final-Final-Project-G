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

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getAppEnv(): AppEnvironment {
  const env = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
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
    apiKey: requireEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: requireEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: requireEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: requireEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requireEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  },
  eas: {
    projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  },
};
