import { Role } from '@/constants/roles';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload extends AuthCredentials {
  displayName: string;
  role?: Role;
}

export interface AuthSession {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: Role;
  displayName: string | null;
}
