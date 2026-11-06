import { create } from 'zustand';
import {
  AuthCredentials,
  AuthSession,
  AuthStatus,
  RegisterPayload,
  Platform,
  getErrorMessage,
} from '@spartan-g/shared-types';
import { onAuthStateChanged, getFirebaseAuth, type User } from '../firebase/auth';
import { authService } from '../services/auth.service';
import { notificationService } from '../services/notification.service';
import { resolveDeploymentTarget } from '../config/env';
import { preparePasswordSignIn, prepareAuthInitialization } from './sign-in-security';

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
  isInitialized: boolean;
  platform: Platform | null;
  // Runtime-only provenance. Never persisted and never inferred from cached tokens.
  sessionOrigin: 'restored' | 'password' | 'registration' | null;
  credentialProof: { session: AuthSession; user: User } | null;

  setPlatform: (platform: Platform) => void;
  setSession: (session: AuthSession) => void;
  initialize: () => () => void;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  signOut: (options?: { preserveScreen?: boolean }) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

export const createAuthStore = () => {
  let operation = 0, event = 0, subscription = 0, credentialOperation: number | null = null;
  let acceptedUser: User | null = null;
  return create<AuthState>((set, get) => ({
    status: 'idle',
    session: null,
    error: null,
    isInitialized: false,
    platform: null,
    sessionOrigin: null,
    credentialProof: null,

    setPlatform: (platform) => set({ platform }),

    setSession: (session) => set({ session, sessionOrigin: 'restored', credentialProof: null }),

    initialize: () => {
      const listener = ++subscription;
      let disposed = false;
      acceptedUser = null;
      set({ status: 'loading', session: null, sessionOrigin: null, credentialProof: null, isInitialized: false });
      let unsubscribe = () => {};
      void (async () => { try {
        await prepareAuthInitialization();
        if (disposed || listener !== subscription) return;
        const auth = getFirebaseAuth();
        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (disposed || listener !== subscription) return;
          const revision = ++event, action = operation;
          if (credentialOperation !== null) return;
          // A delayed duplicate of the credential-login event cannot relabel a fresh
          // password session as restored, or create a second unlock decision.
          if (firebaseUser && firebaseUser === acceptedUser && get().status === 'authenticated' && get().session?.uid === firebaseUser.uid) return;
          const platform = get().platform;
          const current = () => !disposed && listener === subscription && revision === event && action === operation
            && auth.currentUser === firebaseUser;

          if (!firebaseUser) {
            if (!current()) return;
            acceptedUser = null;
            set({ status: 'unauthenticated', session: null, sessionOrigin: null, credentialProof: null, isInitialized: true });
            return;
          }
          if (firebaseUser.isAnonymous) { set({ status: 'unauthenticated', session: null, sessionOrigin: null, credentialProof: null, isInitialized: true }); return; }
          set({ status: 'loading', session: null, sessionOrigin: null, credentialProof: null });
          try {
            const session = await authService.buildSession(firebaseUser);
            if (!current()) return;
            if (platform) {
              authService.assertPlatformAccess(session.role, platform);
            }
            acceptedUser = firebaseUser;
            set({ status: 'authenticated', session, sessionOrigin: 'restored', credentialProof: null, error: null, isInitialized: true });

            // Register device for push notifications (non-blocking)
            if (platform) {
              const deploymentTarget = resolveDeploymentTarget(platform, session.role);
              if (deploymentTarget) {
                notificationService.registerDevice(session.uid, deploymentTarget).catch((err) => {
                  console.error('[AuthStore] Failed to register push token:', err);
                });
              }
            }
          } catch (error) {
            if (!current()) return;
            set({
              status: 'unauthenticated',
              session: null,
              sessionOrigin: null,
              credentialProof: null,
              error: getErrorMessage(error),
              isInitialized: true,
            });
          }
        });
      } catch (error) {
        // Failed installation verification must not expose a login that could
        // submit credentials around the guard. Restart after storage is repaired.
        if (!disposed && listener === subscription) set({ status: 'idle', session: null, sessionOrigin: null, credentialProof: null, error: getErrorMessage(error), isInitialized: false });
      } })();

      return () => { disposed = true; unsubscribe(); };
    },

    signIn: async (credentials) => {
      const platform = get().platform;
      if (!platform) throw new Error('Platform not set');

      const action = ++operation; ++event; credentialOperation = action;
      set({ status: 'loading', session: null, sessionOrigin: null, credentialProof: null, error: null });
      try {
        await preparePasswordSignIn();
        if (action !== operation) return;
        const session = await authService.signIn(credentials, platform);
        if (action !== operation) return;
        const user = getFirebaseAuth().currentUser;
        if (!user || user.isAnonymous || user.uid !== session.uid) throw new Error('Firebase identity changed during sign-in.');
        acceptedUser = user;
        set({ status: 'authenticated', session, sessionOrigin: 'password', credentialProof: { session, user }, isInitialized: true, error: null });
        const target = resolveDeploymentTarget(platform, session.role);
        if (target) notificationService.registerDevice(session.uid, target).catch(() => {});
      } catch (error) {
        if (action === operation) set({ status: 'unauthenticated', session: null, sessionOrigin: null, credentialProof: null, isInitialized: true, error: getErrorMessage(error) });
        throw error;
      } finally { if (credentialOperation === action) credentialOperation = null; }
    },

    register: async (payload) => {
      const platform = get().platform;
      if (!platform) throw new Error('Platform not set');

      const action = ++operation; ++event; credentialOperation = action;
      set({ status: 'loading', session: null, sessionOrigin: null, credentialProof: null, error: null });
      try {
        await prepareAuthInitialization();
        if (action !== operation) return;
        const session = await authService.register(payload, platform);
        if (action !== operation) return;
        const user = getFirebaseAuth().currentUser;
        if (!user || user.isAnonymous || user.uid !== session.uid) throw new Error('Firebase identity changed during registration.');
        acceptedUser = user;
        set({ status: 'authenticated', session, sessionOrigin: 'registration', credentialProof: { session, user }, isInitialized: true, error: null });
        const target = resolveDeploymentTarget(platform, session.role);
        if (target) notificationService.registerDevice(session.uid, target).catch(() => {});
      } catch (error) {
        if (action === operation) set({ status: 'unauthenticated', session: null, sessionOrigin: null, credentialProof: null, isInitialized: true, error: getErrorMessage(error) });
        throw error;
      } finally { if (credentialOperation === action) credentialOperation = null; }
    },

    signOut: async (options) => {
      const action = ++operation; ++event; credentialOperation = null;
      const previousStatus = get().status;
      const previousSession = get().session;
      // A mobile confirmation stays mounted until Firebase resolves; default callers keep their loading UI.
      set(options?.preserveScreen ? { error: null } : { status: 'loading', error: null });
      // Unregister this device's push token for the outgoing account first
      // (best-effort, never blocks/fails sign-out) so pushes stop after logout
      // even if nobody else signs in on this device. registerDevice() also
      // clears any prior owner's claim when a new account logs in.
      const uid = get().session?.uid;
      if (uid) {
        notificationService.unregisterDevice(uid).catch((err) => {
          console.error('[AuthStore] Failed to unregister device on sign-out:', err);
        });
      }
      try {
        await authService.signOut();
        if (action !== operation) return;
        const currentSession = get().session;
        if (currentSession && (currentSession.uid !== previousSession?.uid || currentSession.role !== previousSession?.role)) return;
        acceptedUser = null;
        set({ status: 'unauthenticated', session: null, sessionOrigin: null, credentialProof: null, isInitialized: true, error: null });
      } catch (error) {
        const current = get();
        const sameOwner = current.session?.uid === previousSession?.uid && current.session?.role === previousSession?.role;
        if (action === operation && sameOwner) set({ error: getErrorMessage(error), ...(current.status === 'loading' ? { status: previousStatus } : {}) });
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
};

export const useAuthStore = createAuthStore();

export function getDeploymentTargetFromStore(): import('@spartan-g/shared-types').DeploymentTarget | null {
  const { platform, session } = useAuthStore.getState();
  if (!platform || !session) return null;
  return resolveDeploymentTarget(platform, session.role);
}
