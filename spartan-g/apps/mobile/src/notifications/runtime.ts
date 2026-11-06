import { useAuthStore } from '@spartan-g/shared-services';
import { appLock, currentLockActor, securityNative } from '../security/app-lock';
import type { TapContext } from './tap-coordinator';
import { navigationRef } from '../navigation/navigationRef';
import type { createPreparedNativeNotificationRuntime } from './prepared-native-runtime';

// Deliberately no environment activation flag or production transport in Stage 1.
// A verified server binding/resolver and separate approval are required for Stage 2.
export const PRODUCTION_PUSH_ENABLED = false;
type PreparedRuntime = ReturnType<typeof createPreparedNativeNotificationRuntime>;
// Deliberately no host, credentials, registration instance or environment activation.
const installedRuntime: PreparedRuntime | null = null;
export function installedNotificationRuntime(): PreparedRuntime | null { return PRODUCTION_PUSH_ENABLED ? installedRuntime : null; }
export function notificationContext(): TapContext {
  const actor = currentLockActor(), state = appLock.getSnapshot(), auth = useAuthStore.getState();
  const role = auth.session?.role === 'student' || auth.session?.role === 'facilitator' ? auth.session.role : null;
  return {
    owner: actor?.owner ?? null, role, session: auth.session,
    ready: securityNative && !!actor && auth.status === 'authenticated' && auth.isInitialized && state.owner === actor.owner
      && state.session === actor.session && state.phase === 'ready' && !state.background && !state.busy && navigationRef.isReady(),
    bindingId: installedNotificationRuntime()?.getBinding()?.id ?? null,
  };
}
