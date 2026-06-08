import { create } from 'zustand';

import { onAuthStateChanged } from '@/firebase/auth';
import { getFirebaseAuth } from '@/firebase/auth';
import { authService } from '@/services/auth.service';
import { AuthCredentials, AuthSession, AuthStatus, RegisterPayload } from '@/types/auth.types';
import { getErrorMessage } from '@/utils/errors';

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
  isInitialized: boolean;

  initialize: () => () => void;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  session: null,
  error: null,
  isInitialized: false,

  initialize: () => {
    set({ status: 'loading' });

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
      if (!firebaseUser) {
        set({
          status: 'unauthenticated',
          session: null,
          isInitialized: true,
        });
        return;
      }

      try {
        const session = await authService.buildSession(firebaseUser);
        set({
          status: 'authenticated',
          session,
          error: null,
          isInitialized: true,
        });
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
    set({ status: 'loading', error: null });
    try {
      const session = await authService.signIn(credentials);
      set({ status: 'authenticated', session, error: null });
    } catch (error) {
      set({ status: 'unauthenticated', session: null, error: getErrorMessage(error) });
      throw error;
    }
  },

  register: async (payload) => {
    set({ status: 'loading', error: null });
    try {
      const session = await authService.register(payload);
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
