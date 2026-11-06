import type { ChannelOverview } from './channel-status';
import type { DeviceSettingsTarget } from './settings-links';
export type AndroidPermission = { granted: boolean; canAskAgain: boolean; status: string };
type Phase = 'checking' | 'not-requested' | 'allowed' | 'blocked' | 'unavailable' | 'unsupported';
export type PermissionSettingsState = {
  phase: Phase; busy: boolean; activity: 'request' | 'settings' | null;
  error: string | null; channelBlocked: boolean; channels: ChannelOverview;
};

/** Device permission only. No preference writes, token acquisition or sender ports. */
export function createPermissionSettings(ports: {
  android: boolean; sdk: number; active(): boolean;
  read(): Promise<AndroidPermission>;
  prepare(): Promise<'granted' | 'denied' | 'blocked' | 'unavailable'>;
  open(mayContinue?: () => boolean, target?: DeviceSettingsTarget): Promise<void>;
  channels?(): Promise<ChannelOverview>;
}) {
  const supported = ports.android && Number.isInteger(ports.sdk) && ports.sdk >= 24;
  let live = false, revision = 0, operation: Promise<void> | null = null;
  let state: PermissionSettingsState = { phase: supported ? 'checking' : 'unsupported', busy: false, activity: null, error: null, channelBlocked: false, channels: { status: 'unavailable', channels: [] } };
  const listeners = new Set<() => void>();
  const interrupted = Symbol('interrupted'), deadline = Symbol('native-response-deadline');
  const waiting = new Set<() => void>();
  const publish = (next: PermissionSettingsState) => { if (live) { state = next; listeners.forEach(fn => fn()); } };
  function classify(value: AndroidPermission): Phase {
    if (!value || typeof value.granted !== 'boolean' || typeof value.canAskAgain !== 'boolean'
      || !['granted', 'denied', 'undetermined'].includes(value.status)) throw Error('Permission unavailable');
    if (value.granted && value.status === 'granted') return 'allowed';
    if (value.granted || value.status === 'granted') throw Error('Inconsistent permission');
    return value.status === 'undetermined' && value.canAskAgain && ports.sdk >= 33 ? 'not-requested' : 'blocked';
  }
  const usable = () => live && supported && ports.active();
  // Some RN Android intents start an activity without resolving their promise.
  // Bound the UI wait, not the OS operation; never automatically relaunch it.
  function wait<T>(run: (pending: () => boolean) => Promise<T>, milliseconds: number | null = 4000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let done = false, timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (complete: () => void) => {
        if (done) return;
        done = true; if (timer !== undefined) clearTimeout(timer); waiting.delete(cancel); complete();
      };
      const cancel = () => finish(() => reject(interrupted));
      waiting.add(cancel);
      if (milliseconds !== null) timer = setTimeout(() => finish(() => reject(deadline)), milliseconds);
      void Promise.resolve().then(() => {
        if (done || !usable()) throw interrupted;
        return run(() => !done && usable());
      }).then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    });
  }
  function release() {
    ++revision; operation = null;
    for (const cancel of [...waiting]) cancel();
  }
  async function refresh() {
    if (!usable()) return;
    // Returning from Settings is sufficient to release the launch wait, even
    // when Android omitted the background event or never resolved the intent.
    if (state.activity === 'settings') {
      release(); publish({ ...state, busy: false, activity: null });
    }
    const current = ++revision;
    publish({ ...state, phase: 'checking', error: null });
    try {
      const [permission, channels] = await Promise.all([wait(() => ports.read()), ports.channels
        ? wait(() => ports.channels!()).catch((): ChannelOverview => ({ status: 'unavailable', channels: [] }))
        : Promise.resolve<ChannelOverview>({ status: ports.sdk < 26 ? 'not-required' : 'unavailable', channels: [] })]);
      const phase = classify(permission);
      if (usable() && current === revision) publish({ ...state, phase, channels, error: null, channelBlocked: channels.channels.some(c => c.state === 'blocked') });
    } catch {
      if (usable() && current === revision) publish({ ...state, phase: 'unavailable', error: 'Android permission could not be checked. Try again or open Android Notification Settings.' });
    }
  }
  function act(settingsOnly: boolean | DeviceSettingsTarget = false): Promise<void> {
    if (operation) return operation;
    if (!usable() || state.phase === 'checking') return Promise.resolve();
    if (state.phase === 'unavailable' && !settingsOnly) return refresh();
    const pending = Promise.resolve().then(async () => {
      if (operation !== pending || !usable()) return;
      const current = ++revision;
      try {
        // Recheck on tap: an already granted or denied permission must never be prompted again here.
        const phase = settingsOnly ? state.phase : classify(await wait(() => ports.read()));
        if (!usable() || current !== revision) return;
        const needsChannels = phase === 'allowed' && state.channels.channels.some(c => c.state === 'missing') && !state.channelBlocked;
        if (settingsOnly || (phase === 'allowed' && !needsChannels) || phase === 'blocked' || state.channelBlocked) {
          publish({ ...state, phase, activity: 'settings' });
          await wait(isPending => ports.open(() => isPending() && current === revision && operation === pending, typeof settingsOnly === 'object' ? settingsOnly : undefined));
        } else if (phase === 'not-requested' || needsChannels) {
          publish({ ...state, phase, activity: 'request' });
          // A person's permission/rationale decision has no automatic timeout.
          const result = await wait(() => ports.prepare(), needsChannels ? 4000 : null);
          if (!usable() || current !== revision || operation !== pending) return;
          await refresh(); // Display the actual OS decision, never infer it from the setup result.
          if (!usable() || operation !== pending) return;
          if (result === 'blocked') publish({ ...state, channelBlocked: state.phase !== 'blocked' });
          if (result === 'unavailable' || result === 'denied') publish({ ...state, error: result === 'unavailable'
            ? 'Notification setup could not be completed. Review Android Notification Settings or try again.'
            : 'Notification permission was not enabled. Your saved notification preferences have not changed.' });
        }
      } catch (error) {
        if (error !== interrupted && usable() && current === revision) publish({ ...state, error: state.activity === 'settings'
          ? error === deadline
            ? 'Android did not confirm opening Settings. If it did not open, try again or open device Settings, choose Spartan-G, then Notifications.'
            : 'Android Notification Settings could not be opened. Open device Settings, choose Spartan-G, then Notifications.'
          : state.phase === 'allowed' ? 'Channel setup could not be confirmed. Review Android Notification Settings; app permission is still allowed.'
          : 'Notification permission could not be checked. Try again or open Android Notification Settings.',
          phase: state.activity === 'settings' || state.phase === 'allowed' ? state.phase : 'unavailable' });
      }
    }).finally(() => {
      if (operation === pending) { operation = null; publish({ ...state, busy: false, activity: null }); }
    });
    operation = pending;
    publish({ ...state, busy: true, error: null });
    return pending;
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start() { live = true; publish({ ...state, busy: false, activity: null }); },
    suspend() { release(); publish({ ...state, phase: supported ? 'checking' : 'unsupported', busy: false, activity: null, error: null }); },
    stop() { live = false; release(); },
    refresh, act,
  };
}

export function permissionSettingsCopy(state: PermissionSettingsState) {
  const phase = state.phase;
  return {
    status: phase === 'allowed' ? 'Notifications allowed' : phase === 'blocked' ? 'Notifications blocked'
      : phase === 'not-requested' ? 'Permission not requested' : phase === 'unsupported' ? 'Android notifications unavailable'
      : phase === 'unavailable' ? 'Permission unavailable' : 'Checking Android permission...',
    action: phase === 'allowed' && !state.channelBlocked && state.channels.channels.some(c => c.state === 'missing') ? 'Set Up Notification Channels'
      : phase === 'allowed' ? 'Manage Phone Notifications' : phase === 'blocked' || state.channelBlocked ? 'Open Android Notification Settings'
      : phase === 'unavailable' ? 'Retry Permission Check' : 'Enable Phone Notifications',
  };
}
