/** Device-local presentation preferences. No credentials, records or delivery policy. */
export interface ProfilePreferences {
  messageBanners: boolean;
  appointmentBanners: boolean;
  foregroundSound: boolean;
}
export const defaultPreferences: Readonly<ProfilePreferences> = Object.freeze({ messageBanners: true, appointmentBanners: true, foregroundSound: true });
const privateFallback: Readonly<ProfilePreferences> = Object.freeze({ messageBanners: false, appointmentBanners: false, foregroundSound: false });
export interface PreferenceSnapshot {
  owner: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  values: Readonly<ProfilePreferences>;
  saving: boolean;
  error: string | null;
}
interface StoragePort { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export function preferenceOwner(session: { uid: string; role: string } | null | undefined): string | null {
  return session?.uid && ['student', 'facilitator'].includes(session.role) ? `${session.role}:${session.uid}` : null;
}
export function createPreferenceStore(storage: StoragePort) {
  let generation = 0;
  let snapshot: PreferenceSnapshot = { owner: null, status: 'idle', values: privateFallback, saving: false, error: null };
  let pending: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: PreferenceSnapshot) => { snapshot = next; listeners.forEach(fn => fn()); };
  const key = (owner: string) => `spartan.profile.preferences.v1:${encodeURIComponent(owner)}`;
  const valid = (data: unknown): data is { version: 1; values: ProfilePreferences } => {
    if (!data || typeof data !== 'object') return false;
    const d = data as { version?: unknown; values?: Record<string, unknown> };
    return d.version === 1 && Object.keys(d).length === 2 && !!d.values && typeof d.values === 'object'
      && Object.keys(d.values).length === 3 && Object.keys(defaultPreferences).every(k => typeof d.values?.[k] === 'boolean');
  };
  async function activate(owner: string | null, retry = false) {
    if (snapshot.owner === owner && !retry) return pending;
    const run = ++generation;
    publish({ owner, status: owner ? 'loading' : 'idle', values: privateFallback, saving: false, error: null });
    if (!owner) { pending = null; return; }
    pending = (async () => {
      try {
        const text = await storage.getItem(key(owner));
        const parsed: unknown = text === null ? { version: 1, values: defaultPreferences } : JSON.parse(text);
        if (!valid(parsed)) throw new Error('Invalid preference data');
        if (generation === run) publish({ owner, status: 'ready', values: Object.freeze({ ...parsed.values }), saving: false, error: null });
      } catch {
        if (generation === run) publish({ owner, status: 'error', values: privateFallback, saving: false, error: 'Saved preferences could not be read. Non-urgent foreground banners are paused. Retry or use device notification settings.' });
      }
    })();
    return pending;
  }
  async function update(owner: string, field: keyof ProfilePreferences, value: boolean) {
    if (snapshot.owner !== owner || snapshot.status !== 'ready' || snapshot.saving) return false;
    if (!Object.prototype.hasOwnProperty.call(defaultPreferences, field) || typeof value !== 'boolean') return false;
    const run = generation;
    const previous = snapshot.values;
    const values = { ...previous, [field]: value };
    publish({ ...snapshot, saving: true, error: null });
    try {
      await storage.setItem(key(owner), JSON.stringify({ version: 1, values }));
      if (generation !== run) return false;
      publish({ ...snapshot, values: Object.freeze(values), saving: false });
      return true;
    } catch {
      if (generation === run) publish({ ...snapshot, values: previous, saving: false, error: 'This preference was not saved. Your previous setting is still in use.' });
      return false;
    }
  }
  return { activate, update, getSnapshot: () => snapshot, subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; } };
}

export type PresentationKind = 'message' | 'appointment' | 'protected';
/** Unknown/safety events bypass user suppression; titles and body text never classify safety. */
export function presentationKind(data: Record<string, unknown>): PresentationKind {
  if (data.urgent === true || data.priority === 'urgent' || ['risk', 'alert', 'safety', 'risk_alert'].includes(String(data.type))) return 'protected';
  if (data.type && !['message', 'appointment', 'reschedule'].includes(String(data.type))) return 'protected';
  const url = typeof data.url === 'string' ? data.url : '';
  if (/^spartan-g:\/\/(?:student|facilitator)\/conversation\/[^/?#]+$/.test(url)) return 'message';
  if (/^spartan-g:\/\/(?:student|facilitator)\/appointments$/.test(url)) return 'appointment';
  return 'protected';
}
export function presentationDecision(kind: PresentationKind, snapshot: PreferenceSnapshot, expectedOwner: string | null) {
  if (kind === 'protected') return { banner: true, sound: true };
  if (!expectedOwner || snapshot.owner !== expectedOwner || snapshot.status !== 'ready') return { banner: false, sound: false };
  const banner = kind === 'message' ? snapshot.values.messageBanners : snapshot.values.appointmentBanners;
  return { banner, sound: banner && snapshot.values.foregroundSound };
}
