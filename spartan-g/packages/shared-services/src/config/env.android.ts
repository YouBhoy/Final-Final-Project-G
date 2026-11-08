function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const appEnvRaw = process.env.EXPO_PUBLIC_APP_ENV;
const appEnv: 'development' | 'staging' | 'production' =
  appEnvRaw === 'development' || appEnvRaw === 'staging' || appEnvRaw === 'production'
    ? appEnvRaw
    : 'development';

export const env = {
  appEnv,
  isDev: appEnv === 'development',
  isProd: appEnv === 'production',
  firebase: {
    apiKey: required('EXPO_PUBLIC_FIREBASE_API_KEY', process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
    authDomain: required('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: required('EXPO_PUBLIC_FIREBASE_PROJECT_ID', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: required('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: required('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: required('EXPO_PUBLIC_FIREBASE_APP_ID', process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  },
  eas: {
    projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  },
};

// Replace this with the exact resolveDeploymentTarget from your env.ts if its types differ.
export function resolveDeploymentTarget(platform: string, role?: string) {
  if (!role) return null;
  if (platform === 'mobile') {
    return role === 'student' ? 'student_mobile' : role === 'facilitator' ? 'facilitator_mobile' : null;
  }
  return role === 'student'
    ? 'student_web'
    : role === 'facilitator'
      ? 'facilitator_web'
      : role === 'super_admin'
        ? 'super_admin_web'
        : null;
}