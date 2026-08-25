import { Role } from '../constants/roles';
import { Campus } from '../constants/campuses';
import { DeploymentTarget, Platform } from '../constants/platforms';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload extends AuthCredentials {
  displayName: string;
  role?: Role;
  /** Required campus for both Students and Facilitators. */
  campus: Campus;
}

export interface AuthSession {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: Role;
  displayName: string | null;
  /** The user's assigned campus, if known. */
  campus: Campus | null;
}

export interface PlatformContext {
  platform: Platform;
  deploymentTarget: DeploymentTarget;
}

// Form data types for web UI
export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role?: Role;
  /** Required campus chosen during sign-up. */
  campus: Campus;
}