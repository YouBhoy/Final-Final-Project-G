import { DEFAULT_PHONE_PREFERENCES, validPhonePreferences, type PhonePreferences } from '@spartan-g/shared-services/src/notifications/push-contract';
interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export interface PhoneSnapshot { owner: string | null; status: 'idle' | 'loading' | 'ready' | 'error'; saving: boolean; values: Readonly<PhonePreferences>; error: string | null }
/** Local preparation only. This store must not be mistaken for an acknowledged sender policy. */
export function createPhonePreferenceStore(storage: Storage) {
  const listeners = new Set<() => void>();
  let epoch = 0, pending: Promise<void> | null = null;
  let state: PhoneSnapshot = { owner: null, status: 'idle', saving: false, values: DEFAULT_PHONE_PREFERENCES, error: null };
  const publish = (value: PhoneSnapshot) => { state = value; listeners.forEach(f => f()); };
  const key = (owner: string) => `spartan.phone.preferences.stage1.v1:${encodeURIComponent(owner)}`;
  const activate = (owner: string | null, retry = false) => {
    if (state.owner === owner && !retry) return pending;
    const revision = ++epoch;
    publish({ owner, status: owner ? 'loading' : 'idle', saving: false, values: DEFAULT_PHONE_PREFERENCES, error: null });
    if (!owner) return pending = null;
    return pending = (async () => {
      try {
        const raw = await storage.getItem(key(owner));
        const doc: unknown = raw === null ? { version: 1, values: DEFAULT_PHONE_PREFERENCES } : JSON.parse(raw);
        const d = doc as { version?: unknown; values?: unknown } | null;
        if (!d || Object.keys(d).sort().join(',') !== 'values,version' || d.version !== 1 || !validPhonePreferences(d.values)) throw Error('Invalid preferences');
        if (revision === epoch) publish({ owner, status: 'ready', saving: false, values: Object.freeze({ ...d.values }), error: null });
      } catch {
        if (revision === epoch) publish({ ...state, status: 'error', values: DEFAULT_PHONE_PREFERENCES, error: 'Phone preferences could not be loaded. Delivery preparation is paused.' });
      }
    })();
  };
  async function update(owner: string, field: keyof PhonePreferences, value: boolean) {
    if (owner !== state.owner || state.status !== 'ready' || state.saving || !Object.prototype.hasOwnProperty.call(DEFAULT_PHONE_PREFERENCES, field) || typeof value !== 'boolean') return false;
    const revision = epoch, old = state.values, values = { ...old, [field]: value };
    publish({ ...state, saving: true, error: null });
    try {
      await storage.setItem(key(owner), JSON.stringify({ version: 1, values }));
      if (revision !== epoch) return false;
      publish({ ...state, saving: false, values: Object.freeze(values) }); return true;
    } catch {
      if (revision === epoch) publish({ ...state, saving: false, values: old, error: 'Phone preferences were not saved. Previous choices remain in use.' });
      return false;
    }
  }
  return { activate, update, getSnapshot: () => state, subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; } };
}
