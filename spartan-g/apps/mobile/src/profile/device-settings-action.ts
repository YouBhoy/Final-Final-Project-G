/** Bounded UI acknowledgement for system activities, not cancellation of Android. */
export function createDeviceSettingsAction(ports: { active(): boolean; open(valid: () => boolean): Promise<void> }) {
  let live = false, operation: { valid: boolean; cancel(): void; promise: Promise<void> } | null = null;
  let state = { busy: false, error: null as string | null };
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => { if (live) { state = next; listeners.forEach(fn => fn()); } };
  const release = () => { const old = operation; operation = null; old?.cancel(); publish({ busy: false, error: null }); };
  function run() {
    if (operation) return operation.promise;
    if (!live || !ports.active()) return Promise.resolve();
    const current = { valid: true, cancel: () => {}, promise: Promise.resolve() };
    const valid = () => live && current.valid && operation === current && ports.active();
    operation = current; publish({ busy: true, error: null });
    current.promise = new Promise<void>(resolve => {
      let timer: ReturnType<typeof setTimeout>;
      const finish = (error: string | null) => {
        if (!current.valid) return;
        current.valid = false; clearTimeout(timer);
        if (operation === current) { operation = null; publish({ busy: false, error }); }
        resolve();
      };
      current.cancel = () => finish(null);
      timer = setTimeout(() => finish('Android did not confirm opening Settings. If it did not open, open device Settings and search for accessibility.'), 4000);
      void Promise.resolve().then(() => valid() ? ports.open(valid) : undefined).then(() => finish(null), () => finish('Settings could not be opened. Open device Settings and search for accessibility.'));
    });
    return current.promise;
  }
  return { getSnapshot: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start() { live = true; publish({ busy: false, error: null }); }, suspend: release,
    stop() { live = false; release(); }, run };
}
