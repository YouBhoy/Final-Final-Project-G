import { AppState, Platform, NativeModules } from 'react-native';
import { useSyncExternalStore } from 'react';
import { useAuthStore } from '@spartan-g/shared-services';
import { getFirebaseAuth, signOut } from '@spartan-g/shared-services/src/firebase/auth';
import { createAppLock, type LockActor } from './app-lock-core';
import { platformSecurity } from './security-platform';
import { createFirebaseSessionValidator } from './firebase-session';
import { installPasswordSignInGuard, installAuthInitializationGuard } from '@spartan-g/shared-services/src/store/sign-in-security';
import { createInstallationSessionGuard } from './installation-session';
import { installCaptureGuard, screenPrivacy } from './screen-privacy';

export function currentLockActor(): LockActor | null {
  const auth = useAuthStore.getState();
  if (!auth.isInitialized || auth.status !== 'authenticated' || !auth.session || !['student', 'facilitator'].includes(auth.session.role)) return null;
  try { const native = getFirebaseAuth(); if (native.currentUser?.uid !== auth.session.uid || native.currentUser.isAnonymous) return null;
    const receipt = auth.credentialProof;
    const credential = auth.sessionOrigin === 'password' && receipt?.session === auth.session && receipt.user === native.currentUser ? receipt : undefined;
    return { owner: JSON.stringify([native.app.options.projectId, auth.session.role, auth.session.uid]), session: auth.session, credential };
  } catch { return null; }
}
type Controller = ReturnType<typeof createAppLock>;
type Instance = { controller: Controller; stop?: () => void; bootstrap?: Promise<void> };
const globals = globalThis as typeof globalThis & { __spartanLocalLockV1?: Instance; __spartanLocalLockV2?: Instance; __spartanLocalLockV3?: Instance };
// An older Fast Refresh controller did not verify Firebase. Retire it and wait
// for its native operation to finish before activating the new shared controller.
const legacy = globals.__spartanLocalLockV2 ?? globals.__spartanLocalLockV1;
legacy?.stop?.();
const handoff = legacy?.controller.activate(null);
delete globals.__spartanLocalLockV1;
delete globals.__spartanLocalLockV2;
const singleton = globals.__spartanLocalLockV3 ??= { controller: createAppLock({ ...platformSecurity, actor: currentLockActor, now: Date.now, validateSession: createFirebaseSessionValidator(getFirebaseAuth, currentLockActor), signOut: () => useAuthStore.getState().signOut({ preserveScreen: true }) }), bootstrap: handoff };
export const appLock = singleton.controller;
singleton.stop?.();
const stopCaptureGuard = platformSecurity.native && Platform.OS === 'android' ? installCaptureGuard(() => {
  const actor = currentLockActor(), state = appLock.getSnapshot(), auth = useAuthStore.getState();
  return auth.session?.role === 'student' && !!actor && actor.owner === state.owner && actor.session === state.session &&
    state.phase === 'ready' && !state.background && !state.busy && !state.quickLoginPending && !state.signInPending;
}) : () => {};
const stopCaptureState = platformSecurity.native && Platform.OS === 'android'
  ? appLock.subscribe(() => { void screenPrivacy.refresh().catch(() => {}); }) : () => {};
// Android-only local registration. Shared Auth/web and deferred iOS activation
// have no Expo/native imports through the platform-neutral sign-in port.
const stopSignInGuard = platformSecurity.native && Platform.OS === 'android'
  ? installPasswordSignInGuard(async () => { await singleton.bootstrap; await appLock.prepareSignIn(); }) : () => {};
const stopInitializationGuard = platformSecurity.native && Platform.OS === 'android'
  ? installAuthInitializationGuard(createInstallationSessionGuard({
      async requiresFreshSignIn() {
        const bridge = NativeModules.SpartanSecurityMetadata;
        if (!bridge) throw new Error('Installation security module is unavailable.');
        return bridge.requiresFreshSignIn();
      },
      async signOutRestoredSession() {
        const auth = getFirebaseAuth();
        await auth.authStateReady();
        await signOut(auth);
        if (auth.currentUser !== null) throw new Error('Restored session could not be discarded.');
      },
      async markInstallationReady() { return NativeModules.SpartanSecurityMetadata.markInstallationReady(); },
    })) : () => {};
let previous: LockActor | null = null, previousSignedOut = false, lastAuthorized: LockActor | null = null, bootstrapped = !singleton.bootstrap, disposed = false;
const synchronize = () => {
  if (!bootstrapped || disposed) return;
  if (platformSecurity.native && Platform.OS === 'android') void screenPrivacy.refresh().catch(() => {});
  const actor = platformSecurity.native ? currentLockActor() : null;
  const authState = useAuthStore.getState();
  platformSecurity.trace?.('js_auth', { auth: authState.status, initialized: authState.isInitialized, fresh: authState.sessionOrigin === 'password', account: !!actor });
  let confirmedDeparture = false;
  try { const auth = useAuthStore.getState(), uid = getFirebaseAuth().currentUser?.uid; confirmedDeparture = !!lastAuthorized && ((auth.status === 'unauthenticated' && !uid) || (!!actor && actor.owner !== lastAuthorized.owner)); } catch { /* Do not delete a policy based on an identity/storage error. */ }
  if (confirmedDeparture && lastAuthorized) { const owner = lastAuthorized.owner; lastAuthorized = null; void appLock.forget(owner).catch(() => { /* Retain policy on failed cleanup; next login remains protected and can recover by retrying sign-out. */ }); }
  if (actor) lastAuthorized = actor;
  let signedOut = false;
  try { const auth = useAuthStore.getState(); signedOut = auth.isInitialized && auth.status === 'unauthenticated' && !getFirebaseAuth().currentUser; } catch { /* Unknown identity retains the native privacy shield. */ }
  if (actor?.owner === previous?.owner && actor?.session === previous?.session && signedOut === previousSignedOut) return;
  previousSignedOut = signedOut;
  previous = actor; void appLock.activate(actor, signedOut);
};
const stopAuth = useAuthStore.subscribe(synchronize);
const lifecycle = AppState.addEventListener('change', value => { if (value === 'active' || value === 'inactive' || value === 'background') { if (Platform.OS === 'android') screenPrivacy.foreground(value === 'active'); appLock.lifecycle(value); } });
singleton.stop = () => { disposed = true; stopAuth(); lifecycle.remove(); stopSignInGuard(); stopInitializationGuard(); stopCaptureState(); stopCaptureGuard(); };
const hot = (module as unknown as { hot?: { dispose(fn: () => void): void } }).hot;
hot?.dispose(() => singleton.stop?.());
appLock.lifecycle(AppState.currentState === 'active' ? 'active' : 'background');
synchronize();
if (singleton.bootstrap) void singleton.bootstrap.then(() => { if (!disposed) { bootstrapped = true; synchronize(); } });
export const securityNative = platformSecurity.native;
export const useAppLock = () => useSyncExternalStore(appLock.subscribe, appLock.getSnapshot, appLock.getSnapshot);
