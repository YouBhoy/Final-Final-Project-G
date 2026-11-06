/** Temporary manual test only. No storage, sender, registration binding or token logging. */
export type PrivateTestContext = { owner: string | null; session: unknown; ready: boolean };
type State = PrivateTestContext & { enabled: boolean; busy: boolean; token: string | null; message: string | null };
export function isNativeFcmToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 32 && value.length <= 4096 && /^[A-Za-z0-9_:\-]+$/.test(value)
    && !value.startsWith('ExpoPushToken') && !value.startsWith('ExponentPushToken');
}
export function createPrivateFcmTest(ports: {
  context(): PrivateTestContext; permission(): Promise<'granted' | 'denied' | 'blocked' | 'unavailable'>;
  token(): Promise<{ type: string; data: unknown }>; copy(token: string): Promise<void>; clearCopy(): void;
  timeoutMs?: number;
}) {
  let generation = 0, stopped = false, running: Promise<void> | null = null;
  let state: State = { ...ports.context(), enabled: false, busy: false, token: null, message: null };
  const listeners = new Set<() => void>();
  const publish = (next: State) => { state = next; listeners.forEach(fn => fn()); };
  const same = (actor: PrivateTestContext) => {
    const current = ports.context();
    return !stopped && current.ready && actor.owner !== null && current.owner === actor.owner && current.session === actor.session;
  };
  const reset = () => {
    generation++; ports.clearCopy();
    publish({ ...ports.context(), enabled: false, busy: false, token: null, message: null });
  };
  function synchronize() {
    const now = ports.context();
    if (!now.ready || now.owner !== state.owner || now.session !== state.session) reset();
  }
  const bounded = async <T,>(promise: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), ports.timeoutMs ?? 30000); })]); }
    finally { if (timer) clearTimeout(timer); }
  };
  const obtain = () => {
    synchronize();
    if (running) return running;
    const actor = ports.context(), version = generation;
    if (!actor.ready || !actor.owner || !state.enabled || stopped) return Promise.resolve();
    ports.clearCopy(); publish({ ...state, busy: true, token: null, message: null });
    const current = () => generation === version && state.enabled && same(actor);
    running = (async () => {
      try {
        const permission = await bounded(ports.permission());
        if (!current()) return;
        if (permission !== 'granted') {
          publish({ ...state, message: permission === 'blocked' ? 'Android notifications are blocked. Review device notification settings, then retry.' : 'Notification permission was not granted or is unavailable. No token was obtained.' }); return;
        }
        const result = await bounded(ports.token());
        if (!current()) return;
        if (result.type !== 'android' || !isNativeFcmToken(result.data)) {
          publish({ ...state, message: 'A valid native Android FCM token was not returned. No token is displayed.' }); return;
        }
        publish({ ...state, token: result.data, message: 'Native Android FCM token ready. Keep it private; use it only in Firebase Send test message.' });
      } catch {
        if (current()) publish({ ...state, message: 'FCM registration did not complete. Check internet and Google Play services, then retry. No token was saved.' });
      } finally {
        running = null;
        if (current()) publish({ ...state, busy: false });
      }
    })();
    return running;
  };
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    synchronize,
    start() { stopped = false; synchronize(); },
    enable(value: boolean) {
      synchronize(); if (stopped || !ports.context().ready || !ports.context().owner) return;
      reset(); if (value) publish({ ...state, enabled: true });
    },
    obtain,
    async copy() {
      synchronize(); const actor = ports.context(), value = state.token, version = generation;
      if (stopped || !state.enabled || state.busy || !value || !same(actor)) return;
      try {
        await ports.copy(value);
        if (generation !== version || !same(actor)) { ports.clearCopy(); return; }
        publish({ ...state, message: 'Copied as sensitive clipboard content. Spartan-G attempts to clear its copy after 60 seconds or when this test closes or locks. Android may retain it if the app stops. Paste only into Firebase Send test message, never into chat.' });
      } catch {
        if (generation === version && same(actor)) publish({ ...state, message: 'Copy was unavailable. No token was logged or saved.' });
      }
    },
    stop() { stopped = true; reset(); listeners.clear(); },
  };
}
