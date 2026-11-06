import * as SecureStore from 'expo-secure-store';
import { uuid } from 'expo-modules-core';
import { AppState } from 'react-native';
import { navigationRef } from '../navigation/navigationRef';
import { nativeFcm } from './native-fcm';
import { createNotificationHttpClient } from './http-client';
import { createRegistrationProtocol } from './registration-protocol';
import { createNotificationCapabilityStore } from './capability-store';
import { createPreparedNotificationSession } from './prepared-session';
import { createAutomaticNotificationRegistration } from './automatic-registration';
import type { DeviceActor } from './device-registration';
import type { PhonePreferences } from '@spartan-g/shared-services/src/notifications/push-contract';

/** Fully composed, deliberately uninstalled factory. No production URL or activation flag is supplied. */
export function createPreparedNativeNotificationRuntime(ports: {
  enabled: boolean; origin: string; approvedOrigin: string; apiPrefix?: string; project: 'spartan-g-a2d80' | 'spartan-g-assessment-staging';
  actor(): DeviceActor | null; authProject(): string; idToken(): Promise<string>; preferences(): PhonePreferences;
}) {
  const actor = () => { const a = ports.actor(); return a ? { ...a, ready: a.ready && AppState.currentState === 'active' && navigationRef.isReady() } : null; };
  const api = createNotificationHttpClient({ ...ports, fetch, async idToken() {
    const before = actor(); if (!before?.ready) throw Error('Protected session required');
    const token = await ports.idToken(), after = actor();
    if (!after?.ready || before.owner !== after.owner || before.session !== after.session) throw Error('Session changed'); return token;
  } });
  const key = `spartan.notifications.${ports.project}`, options = { keychainService: 'spartan-notification-bindings-v1', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  const storage = createNotificationCapabilityStore({ read: () => SecureStore.getItemAsync(key + '.cleanup', options), write: value => SecureStore.setItemAsync(key + '.cleanup', value, options) });
  const protocol = createRegistrationProtocol({ ...storage, actor, random: () => uuid.v4() + uuid.v4(),
    async installationId() {
      const saved = await SecureStore.getItemAsync(key + '.installation', options); if (saved !== null) { if (!/^[A-Za-z0-9_-]{12,96}$/.test(saved)) throw Error('Installation identity unavailable'); return saved; }
      const value = uuid.v4(); await SecureStore.setItemAsync(key + '.installation', value, options); return value;
    }, request: (operation, body) => api.request(operation, body),
  });
  const permission = async () => (await import('expo-notifications')).getPermissionsAsync().then(p => p.granted);
  let automatic: ReturnType<typeof createAutomaticNotificationRegistration> | null = null;
  const session = createPreparedNotificationSession({ enabled: ports.enabled, actor, preferences: ports.preferences,
    permission,
    token: nativeFcm.token, tokenListener: nativeFcm.tokenListener, bind: protocol.bind, revoke: protocol.revoke, resolve: e => api.resolve(e),
    onRegistrationChange: () => automatic?.observe(),
  });
  const proof = ports.enabled ? nativeFcm.proofListener(protocol.observe) : null;
  const revoke = async () => {
    if (!ports.enabled) return true;
    // Also cancel an in-flight proof and durable pending generation, not only a completed binding.
    protocol.clearProofs(); const result = await session.revoke();
    try { await protocol.cleanup(); return result; } catch { return false; }
  };
  let lastPreferences: string | null = null, initialized = false, previousOwner = actor()?.owner;
  async function synchronizeOnce() {
      if (!ports.enabled) return false;
      if (AppState.currentState !== 'active') protocol.clearProofs();
      const owner = actor()?.owner;
      if (!initialized || previousOwner !== owner) {
        if (!await revoke()) return false;
        initialized = true; previousOwner = owner; lastPreferences = null;
      }
      if (!ports.preferences().phoneEnabled || !await permission().catch(() => false)) { await revoke(); lastPreferences = null; return false; }
      const ready = await session.synchronize(), binding = session.getBinding(), current = actor();
      const preferences = ports.preferences(), signature = JSON.stringify([current?.owner, binding?.id, preferences]);
      if (binding && current?.ready && signature !== lastPreferences) { await api.request('preferences', { bindingId: binding.id, preferences }); lastPreferences = signature; }
      return ready && !!binding;
  }
  automatic = createAutomaticNotificationRegistration({ enabled: ports.enabled, active: () => AppState.currentState === 'active', actor,
    consent: () => ports.preferences().phoneEnabled, permission, synchronize: synchronizeOnce, binding: session.getBinding, revoke, cancelProofs: protocol.clearProofs });
  let wasActive = AppState.currentState === 'active';
  return { ...session,
    getSnapshot: automatic.getSnapshot, subscribe: automatic.subscribe,
    retryRegistration: automatic.retry,
    async synchronize() { const active = AppState.currentState === 'active'; if (!active) protocol.clearProofs(); const resumed = active && !wasActive; wasActive = active; return resumed ? automatic!.retry() : automatic!.synchronize(); },
    async revoke() { automatic!.invalidate(); return revoke(); },
    async logout() { automatic!.invalidate(); if (!ports.enabled) return true; protocol.clearProofs(); const result = await session.logout(); try { await protocol.cleanup(); return result; } catch { return false; } },
    async dispose() { automatic!.dispose(); proof?.remove(); protocol.clearProofs(); const result = await session.dispose(); if (!ports.enabled) return result; try { await protocol.cleanup(); return result; } catch { return false; } },
  };
}
