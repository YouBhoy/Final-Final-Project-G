import { DeploymentTarget } from '@spartan-g/shared-types';

export type AppEnvironment = 'development' | 'staging' | 'production';

export interface EnvConfig {
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