import { categoryEnabled, PUSH_CATEGORIES, type PhonePreferences } from '@spartan-g/shared-services/src/notifications/push-contract';
export interface RegistrationActor { owner: string; session: unknown; unlocked: boolean }
/** Injectable preparation controller. The shipped Stage 1 adapter never connects these ports to production. */
export function createLocalRegistration(ports: {
  projectId: 'demo-push-stage1'; actor(): RegistrationActor | null;
  preferences(): PhonePreferences; permission(): Promise<boolean>; token(): Promise<string>;
  bind(owner: string, token: string): Promise<{ bindingId: string }>;
  revoke(owner: string, bindingId: string): Promise<void>;
}) {
  if (ports.projectId !== 'demo-push-stage1') throw Error('Synthetic project required');
  let epoch = 0, busy = false, again = false, disposed = false, binding: { owner: string; id: string } | null = null;
  const cleanup = new Map<string, { owner: string; id: string }>();
  let departedSession: unknown = null;
  const deferCleanup = (value: { owner: string; id: string }) => cleanup.set(JSON.stringify([value.owner, value.id]), value);
  async function finishCleanup() {
    for (const [key, value] of cleanup) { await ports.revoke(value.owner, value.id); cleanup.delete(key); }
  }
  const enabled = () => PUSH_CATEGORIES.some(c => categoryEnabled(ports.preferences(), c));
  const same = (actor: RegistrationActor, version: number) => { const a = ports.actor(); return !disposed && enabled() && epoch === version && a?.owner === actor.owner && a.session === actor.session && a.unlocked; };
  async function register() {
    const actor = ports.actor();
    if (busy) { again = true; return false; }
    if (disposed || !actor?.unlocked || actor.session === departedSession || !enabled()) return false;
    busy = true;
    try {
      if (binding && binding.owner !== actor.owner) { deferCleanup(binding); binding = null; epoch++; }
      const version = epoch;
      await finishCleanup();
      if (!same(actor, version)) return false;
      if (!await ports.permission() || !same(actor, version)) return false;
      const token = await ports.token();
      if (!/^ExponentPushToken\[synth_[A-Za-z0-9_-]+\]$/.test(token) || !same(actor, version)) return false;
      const result = await ports.bind(actor.owner, token);
      if (!same(actor, version)) { deferCleanup({ owner: actor.owner, id: result.bindingId }); await finishCleanup(); return false; }
      binding = { owner: actor.owner, id: result.bindingId }; return true;
    } catch { return false; } finally { busy = false; if (again) { again = false; void register(); } }
  }
  async function logout() {
    epoch++; again = false; departedSession = ports.actor()?.session;
    if (binding) deferCleanup(binding);
    binding = null;
    try { await finishCleanup(); } catch { return false; }
    return true;
  }
  return { register, rotate: () => { epoch++; return register(); }, logout,
    binding: () => ports.actor()?.unlocked && ports.actor()?.owner === binding?.owner && enabled() ? binding : null,
    dispose: async () => { disposed = true; await logout(); } };
}
