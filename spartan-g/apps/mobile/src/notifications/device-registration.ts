/** Production-shaped lifecycle preparation. No instance/transport is installed and no token is requested at import. */
export interface DeviceActor { owner: string; session: unknown; ready: boolean }
export function createDeviceRegistration(ports: {
  enabled: boolean; actor(): DeviceActor | null; wantsPush(): boolean;
  now?(): number;
  permission(): Promise<boolean>; token(): Promise<string>;
  bind(actor: DeviceActor, token: string): Promise<{ id: string }>;
  // Server checks ownership. Outgoing-session cleanup must precede logout or use an approved narrow revocation capability.
  revoke(actor: DeviceActor, bindingId: string): Promise<void>;
}) {
  let epoch = 0, busy = false, disposed = false, blockedSession: unknown, queuedToken: string | undefined;
  let binding: { actor: DeviceActor; id: string; token: string; boundAt: number } | null = null;
  const now = ports.now ?? Date.now;
  const pending = new Map<string, { actor: DeviceActor; id: string }>();
  const cleanup = async () => { for (const [key, item] of pending) { await ports.revoke(item.actor, item.id); pending.delete(key); } };
  const queue = () => { if (binding) pending.set(binding.id, binding); binding = null; };
  const same = (actor: DeviceActor, generation: number) => { const c = ports.actor(); return !disposed && generation === epoch && ports.enabled && ports.wantsPush() && c?.owner === actor.owner && c.session === actor.session && c.ready && actor.session !== blockedSession; };
  const register = async (refreshedToken?: string): Promise<boolean> => {
      if (disposed || !ports.enabled) return false;
      // A refresh listener supplies its token directly; fetching here would emit another refresh.
      if (busy) { if (refreshedToken) { queuedToken = refreshedToken; ++epoch; } return false; }
      const actor = ports.actor();
      if (disposed || busy || !ports.enabled || !actor?.ready || actor.session === blockedSession || !ports.wantsPush()) return false;
      busy = true; let failed = false; const generation = ++epoch;
      try {
        if (binding && (binding.actor.owner !== actor.owner || binding.actor.session !== actor.session)) queue();
        await cleanup();
        if (!same(actor, generation)) return false;
        if (!await ports.permission()) { queue(); await cleanup(); return false; }
        if (!same(actor, generation)) return false;
        const token = refreshedToken ?? await ports.token();
        if (!same(actor, generation) || !/^[A-Za-z0-9_:\-]{20,4096}$/.test(token) || /^(Expo|Exponent)PushToken/.test(token)) return false;
        // Renew on a foreground synchronization before the server's 24-hour lease.
        // No background timer or unattended token registration is introduced.
        if (binding?.token === token && now() >= binding.boundAt && now() - binding.boundAt < 23 * 3600000) return true;
        queue(); await cleanup(); if (!same(actor, generation)) return false;
        const created = await ports.bind(actor, token);
        if (!/^[A-Za-z0-9_-]{12,96}$/.test(created.id)) return false;
        if (!same(actor, generation)) { pending.set(created.id, { actor, id: created.id }); await cleanup(); return false; }
        binding = { actor, id: created.id, token, boundAt: now() }; return true;
      } catch { failed = true; return false; } finally {
        busy = false;
        const next = queuedToken; queuedToken = undefined;
        // Coalesce a distinct native refresh event, never retry an ambiguous bind failure.
        if (next && !failed && !disposed) void register(next);
      }
  };
  return {
    register,
    async revoke() { ++epoch; queue(); try { await cleanup(); return true; } catch { return false; } },
    async logout() { blockedSession = ports.actor()?.session; ++epoch; queue(); try { await cleanup(); return true; } catch { return false; } },
    async dispose() { disposed = true; ++epoch; queue(); try { await cleanup(); return true; } catch { return false; } },
    getBinding() { const actor = ports.actor(); return binding && ports.enabled && ports.wantsPush() && actor?.ready && actor.owner === binding.actor.owner && actor.session === binding.actor.session ? { id: binding.id } : null; },
    hasPendingCleanup: () => pending.size > 0,
  };
}
