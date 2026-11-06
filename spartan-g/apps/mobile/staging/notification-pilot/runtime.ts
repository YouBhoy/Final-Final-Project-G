import Constants from 'expo-constants';
import { useAuthStore, getFirebaseApp, getFirebaseAuth } from '@spartan-g/shared-services';
import { appLock, currentLockActor, securityNative } from '../../src/security/app-lock';
import { navigationRef } from '../../src/navigation/navigationRef';
import { phonePreferences } from '../../src/notifications/phone-preferences';
import { createPreparedNativeNotificationRuntime } from '../../src/notifications/prepared-native-runtime';
import type { TapContext } from '../../src/notifications/tap-coordinator';
import { validatePilot } from './policy';
const approved: unknown = require('./approved.json');
export const PRODUCTION_PUSH_ENABLED = false;
let runtime: ReturnType<typeof createPreparedNativeNotificationRuntime> | null = null;
let retiring = false, retirement: Promise<void> = Promise.resolve();
export function installedNotificationRuntime() {
  const plan = validatePilot(approved, process.env.EXPO_PUBLIC_SPARTAN_ANDROID_PROFILE ?? '');
  if (!plan) return null;
  if (retiring) return null;
  if (Constants.expoConfig?.android?.package !== 'com.spartang.mobile.staging' || getFirebaseApp().options.projectId !== plan.project) throw Error('notification_pilot_native_project_mismatch');
  if (!runtime) runtime = createPreparedNativeNotificationRuntime({ enabled: true, ...plan, approvedOrigin: plan.origin,
    actor: () => { const c = baseContext(); return c.owner && c.role === 'student' && c.session ? { owner: c.owner, session: c.session, ready: c.ready } : null; },
    authProject: () => getFirebaseAuth().app.options.projectId ?? '',
    async idToken() {
      const user = getFirebaseAuth().currentUser, session = useAuthStore.getState().session;
      // Local owner keys include project and role; the Auth UID is the canonical session UID.
      if (!user || session?.role !== 'student' || user.uid !== session.uid || !baseContext().ready) throw Error('Staging session unavailable');
      return user.getIdToken();
    },
    preferences: () => { const p = phonePreferences.getSnapshot(), actor = currentLockActor(); return p.owner === actor?.owner && p.status === 'ready' ? p.values : { phoneEnabled: false, messages: false, appointments: false, assessmentUpdates: false }; },
  });
  return runtime;
}
export async function acquireNotificationRuntime() { await retirement; return installedNotificationRuntime(); }
export async function releaseNotificationRuntime(value: NonNullable<typeof runtime>) {
  if (runtime !== value) return retirement;
  runtime = null; retiring = true;
  // Never overlap listeners or secure-store writers from successive root mounts.
  retirement = value.dispose().then(ok => { if (!ok) throw Error('Staging notification cleanup pending'); retiring = false; });
  return retirement;
}
function baseContext(): TapContext {
  const actor = currentLockActor(), state = appLock.getSnapshot(), auth = useAuthStore.getState();
  const role = auth.session?.role === 'student' || auth.session?.role === 'facilitator' ? auth.session.role : null;
  return { owner: actor?.owner ?? null, role, session: auth.session,
    ready: securityNative && !!actor && auth.status === 'authenticated' && auth.isInitialized && state.owner === actor.owner && state.session === actor.session
      && state.phase === 'ready' && !state.background && !state.busy && navigationRef.isReady(),
    // Avoid factory/context recursion. Binding lookup itself only consults the current protected actor.
    bindingId: null,
  };
}
export function notificationContext(): TapContext { return { ...baseContext(), bindingId: runtime?.getBinding()?.id ?? null }; }
