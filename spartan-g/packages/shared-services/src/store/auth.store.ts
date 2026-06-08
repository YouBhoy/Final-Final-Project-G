import { create } from 'zustand';
import {
  AuthCredentials,
  AuthSession,
  AuthStatus,
  RegisterPayload,
  Platform,
  getErrorMessage,
} from '@spartan-g/shared-types';
import { onAuthStateChanged, getFirebaseAuth } from '../firebase/auth';
import { authService } from '../services/auth.service';
import { resolveDeploymentTarget } from '../config/env';

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
  isInitialized: boolean;
  platform: Platform | null;

  setPlatform: (platform: Platform) => void;
  initialize: () => () => void;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

export const createAuthStore = () =>
  create<AuthState>((set, get) => ({
    status: 'idle',
    session: null,
    error: null,
    isInitialized: false,
    platform: null,

    setPlatform: (platform) => set({ platform }),

    initialize: () => {
      set({ status: 'loading' });

      const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
        const platform = get().platform;

        if (!firebaseUser) {
          set({ status: 'unauthenticated', session: null, isInitialized: true });
          return;
        }

        try {
          const session = await authService.buildSession(firebaseUser);
          if (platform) {
            authService.assertPlatformAccess(session.role, platform);
          }
          set({ status: 'authenticated', session, error: null, isInitialized: true });
        } catch (error) {
          set({
            status: 'unauthenticated',
            session: null,
            error: getErrorMessage(error),
            isInitialized: true,
          });
        }
      });

      return unsubscribe;
    },

    signIn: async (credentials) => {
      const platform = get().platform;
      if (!platform) throw new Error('Platform not set');

      set({ status: 'loading', error: null });
      try {
        const session = await authService.signIn(credentials, platform);
        set({ status: 'authenticated', session, error: null });
      } catch (error) {
        set({ status: 'unauthenticated', session: null, error: getErrorMessage(error) });
        throw error;
      }
    },

    register: async (payload) => {
      const platform = get().platform;
      if (!platform) throw new Error('Platform not set');

      set({ status: 'loading', error: null });
      try {
        const session = await authService.register(payload, platform);
        set({ status: 'authenticated', session, error: null });
      } catch (error) {
        set({ status: 'unauthenticated', session: null, error: getErrorMessage(error) });
        throw error;
      }
    },

    signOut: async () => {
      set({ status: 'loading', error: null });
      try {
        await authService.signOut();
        set({ status: 'unauthenticated', session: null, error: null });
      } catch (error) {
        set({ error: getErrorMessage(error) });
        throw error;
      }
    },

    resetPassword: async (email) => {
      set({ error: null });
      try {
        await authService.resetPassword(email);
      } catch (error) {
        set({ error: getErrorMessage(error) });
        throw error;
      }
    },

    clearError: () => set({ error: null }),
  }));

export const useAuthStore = createAuthStore();

export function getDeploymentTargetFromStore(): import('@spartan-g/shared-types').DeploymentTarget | null {
  const { platform, session } = useAuthStore.getState();
  if (!platform || !session) return null;
  return resolveDeploymentTarget(platform, session.role);
}
