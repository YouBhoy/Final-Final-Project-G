import { createDeviceRegistration, type DeviceActor } from './device-registration';
import type { PhonePreferences, PushEnvelope } from '@spartan-g/shared-services/src/notifications/push-contract';
import type { AuthorizedTap, TapContext } from './tap-coordinator';
/** Explicit dependency wiring for a future approved backend; no automatic production instance. */
export function createPreparedNotificationSession(ports: {
  enabled: boolean; actor(): DeviceActor | null; preferences(): PhonePreferences;
  permission(): Promise<boolean>; token(): Promise<{ type: string; data: unknown }>;
  tokenListener(fn: (token: { type: string; data: unknown }) => void): { remove(): void };
  bind(actor: DeviceActor, token: string, preferences: PhonePreferences): Promise<{ id: string }>;
  revoke(actor: DeviceActor, id: string): Promise<void>;
  onRegistrationChange?(): void;
  resolve(envelope: PushEnvelope, actor: DeviceActor): Promise<Omit<AuthorizedTap, 'owner'>>;
}) {
  const controller = createDeviceRegistration({ enabled: ports.enabled, actor: ports.actor,
    wantsPush: () => ports.preferences().phoneEnabled, permission: ports.permission,
    async token() { const token = await ports.token(); if (token.type !== 'android' || typeof token.data !== 'string') throw Error('Native FCM token required'); return token.data; },
    bind: (actor, token) => ports.bind(actor, token, ports.preferences()), revoke: ports.revoke,
  });
  let owner = ports.actor()?.owner, stopped = false;
  const subscription = ports.enabled ? ports.tokenListener(token => {
    if (!stopped && token.type === 'android' && typeof token.data === 'string') void controller.register(token.data).finally(() => ports.onRegistrationChange?.());
  }) : null;
  return {
    async synchronize() {
      if (!ports.enabled || stopped) return false;
      const current = ports.actor();
      if (owner && current?.owner !== owner && !await controller.revoke()) return false;
      owner = current?.owner;
      if (!ports.preferences().phoneEnabled || !await ports.permission()) { await controller.revoke(); return false; }
      if (current?.ready) return controller.register();
      return false;
    },
    async logout() { return controller.logout(); },
    revoke: controller.revoke,
    async resolve(envelope: PushEnvelope, context: TapContext): Promise<AuthorizedTap | null> {
      const actor = ports.actor(), binding = controller.getBinding();
      if (!ports.enabled || stopped || !actor?.ready || !context.ready || context.session !== actor.session || context.owner !== actor.owner || binding?.id !== envelope.bindingId) return null;
      const result = await ports.resolve(envelope, actor), latest = ports.actor();
      if (latest?.owner !== actor.owner || latest.session !== actor.session || !latest.ready || controller.getBinding()?.id !== binding.id) return null;
      return { ...result, owner: actor.owner };
    },
    getBinding: controller.getBinding,
    async dispose() { stopped = true; subscription?.remove(); return controller.dispose(); },
  };
}
