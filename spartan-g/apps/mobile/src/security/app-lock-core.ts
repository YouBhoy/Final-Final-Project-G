export const lockTimeouts = [0, 60_000, 300_000, 900_000] as const;
export interface LockActor { owner: string; session: unknown; credential?: object }
export interface LockState { owner: string | null; session: unknown; phase: 'loading' | 'checking' | 'ready' | 'locked' | 'error'; enabled: boolean; quickLogin: boolean; enrolled: boolean; canRestoreLock: boolean; quickLoginPending: boolean; passwordRequired: boolean; requireAfterSignIn: boolean; signInPending: boolean; canRestoreSignIn: boolean; timeoutMs: number; busy: boolean; background: boolean; error: string | null; cleanupError: string | null; verifiedLocallyAt: number | null }
export interface LockPorts {
  /** Optional diagnostic sink. Fixed events and non-identifying state only. */
  trace?(event: string, data?: Record<string, string | boolean | number>): void;
  actor(): LockActor | null;
  read(key: string, biometric: boolean, authorize?: () => boolean): Promise<string | null>;
  write(key: string, value: string, biometric: boolean, authorize?: () => boolean): Promise<void>;
  remove(key: string, biometric: boolean): Promise<void>;
  capability(): Promise<{ available: boolean; reason?: string }>;
  shield(enabled: boolean): Promise<void>;
  newInstallationId(): string;
  now(): number;
  signOut(): Promise<void>;
  validateSession(actor: LockActor): Promise<void>;
}
export const installationKey = 'spartan.local-lock.installation.v1';
export const lockKey = (owner: string, proof = false) => 'spartan.local-lock.' + (proof ? 'proof.' : 'policy.') + Array.from(owner).map(c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('');
export const signInKey = (owner: string, proof = false) => 'spartan.after-sign-in.' + (proof ? 'proof.' : 'policy.') + Array.from(owner).map(c => c.codePointAt(0)!.toString(16).padStart(6, '0')).join('');
export const signInPendingKey = 'spartan.after-sign-in.pending.v1';
const errorText = 'Local protection could not be verified. Retry, or sign out and sign in again with your existing Firebase credentials. No data needs to be cleared.';
function sessionErrorMessage(error: unknown): string | null {
  const code = (error as { code?: string })?.code;
  if (code === 'quick-login/network') return 'An online Firebase session check is required. Check your connection and try again, or use email and password instead.';
  if (code === 'quick-login/invalid-session') return 'Your Firebase session is no longer valid. Use email and password instead to sign in again.';
  if (code === 'quick-login/account-changed') return 'The authenticated account changed. Use email and password instead; this fingerprint cannot unlock another account.';
  if (code === 'quick-login/unavailable') return 'Firebase could not confirm this session. Retry, or use email and password instead.';
  return null;
}
/** Local gate only. No server trust, Firebase credentials, custom PINs or token serialization. */
export function createAppLock(ports: LockPorts) {
  let state: LockState = { owner: null, session: null, phase: 'loading', enabled: false, quickLogin: false, enrolled: false, canRestoreLock: false, quickLoginPending: false, passwordRequired: false, requireAfterSignIn: false, signInPending: false, canRestoreSignIn: false, timeoutMs: 0, busy: false, background: false, error: null, cleanupError: null, verifiedLocallyAt: null };
  const listeners = new Set<() => void>();
  const cleanupPending = new Set<string>();
  const trace = (event: string, data?: Record<string, string | boolean | number>) => { try { ports.trace?.(event, data); } catch { /* Observation cannot affect authentication. */ } };
  let epoch = 0, actor: LockActor | null = null, installation = '', active = true, awayAt: number | null = null, work = Promise.resolve(), running = false, shielded = false, backgroundEpoch = 0, promptOnlyInterruption = false;
  const publish = (patch: Partial<LockState>) => { state = { ...state, ...patch }; trace('js_state', { phase: state.phase, enabled: state.enabled, quick: state.quickLogin, after: state.requireAfterSignIn, enrolled: state.enrolled, pending: state.signInPending, busy: state.busy, background: state.background, account: !!state.owner }); listeners.forEach(f => f()); };
  const serial = (fn: () => Promise<void>) => { const result = work.then(fn); work = result.catch(() => {}); return result; };
  const same = (a: LockActor, e: number) => { const current = ports.actor(); return epoch === e && current?.owner === a.owner && current.session === a.session; };
  const cover = async (enabled: boolean) => { if (shielded !== enabled) { await ports.shield(enabled); shielded = enabled; } };
  const metadata = (a: LockActor, timeoutMs: number, pending = false, quickLogin = state.quickLogin, enabled = state.enabled, enrolled = state.enrolled) => JSON.stringify({ schema: 3, owner: a.owner, installation, timeoutMs, enabled, pending, quickLogin, enrolled });
  const proof = (a: LockActor) => JSON.stringify({ schema: 1, purpose: 'local-biometric-lock', owner: a.owner, installation });
  const signInProof = (a: LockActor) => JSON.stringify({ schema: 1, purpose: 'after-password-sign-in', owner: a.owner, installation });
  const signInPolicy = (a: LockActor, pending = false, enabled = true) => JSON.stringify({ schema: 2, owner: a.owner, installation, enabled, pending });
  async function writePlain(key: string, value: string) {
    await ports.write(key, value, false);
    // Metadata reads do not prompt. Confirm persistence before submitting Firebase
    // credentials or reporting enrollment complete; never infer it from a void write.
    if (await ports.read(key, false) !== value) throw new Error(errorText);
  }
  async function removePolicy(owner: string) { await ports.remove(lockKey(owner, true), true); await ports.remove(lockKey(owner), false); if (await ports.read(lockKey(owner), false) !== null) throw new Error(errorText); }
  async function removeSignInPolicy(owner: string) { await ports.remove(signInKey(owner, true), true); await ports.remove(signInKey(owner), false); if (await ports.read(signInKey(owner), false) !== null) throw new Error(errorText); }
  async function revokeEnrollment(owner: string) {
    const raw = await ports.read(lockKey(owner), false);
    if (raw !== null) {
      const p = JSON.parse(raw);
      if (![1,2,3].includes(p.schema) || p.owner !== owner || typeof p.installation !== 'string' || !lockTimeouts.includes(p.timeoutMs)
        || typeof p.enabled !== 'boolean' || (p.schema !== 1 && typeof p.quickLogin !== 'boolean')) throw new Error(errorText);
      // Record revocation BEFORE removing proof. A crash cannot recreate a
      // usable enrollment from a remembered ON preference or a leftover proof.
      await writePlain(lockKey(owner), JSON.stringify({schema:3,owner,installation:p.installation,timeoutMs:p.timeoutMs,
        enabled:p.enabled,quickLogin:p.quickLogin ?? true,pending:false,enrolled:false}));
    }
    await ports.remove(lockKey(owner,true),true);
    await ports.remove(signInKey(owner,true),true);
    // The independent after-sign-in policy stays intact; its next use requires
    // fresh Firebase credentials and an explicit new OS enrollment.
  }
  async function ensureInstallation() {
    const saved = await ports.read(installationKey, false); installation = saved === null ? ports.newInstallationId() : saved;
    if (!/^[a-f0-9-]{36}$/i.test(installation)) throw new Error(errorText);
    if (saved === null) await writePlain(installationKey, installation);
  }
  async function clearSignInJournal() { await ports.remove(signInPendingKey, false); if (await ports.read(signInPendingKey, false) !== null) throw new Error(errorText); }
  async function prepareSignIn() {
    trace('js_password_prepare');
    return serial(async () => {
      for (const owner of [...cleanupPending]) {
        await revokeEnrollment(owner);
        cleanupPending.delete(owner);
      }
      publish({ cleanupError:null });
      await ensureInstallation();
      const attempt = ports.newInstallationId();
      if (!/^[a-f0-9-]{36}$/i.test(attempt)) throw new Error(errorText);
      // Written before Firebase credentials are submitted. Process death before
      // the challenge completes therefore cannot turn that login into restoration.
      await writePlain(signInPendingKey, JSON.stringify({ schema: 1, installation, attempt }));
    });
  }
  async function capability() { const value = await ports.capability(); if (!value.available) throw new Error(value.reason || 'Strong enrolled biometrics are unavailable on this device.'); }
  async function verifySession(a: LockActor) {
    if (typeof ports.validateSession !== 'function') throw Object.assign(new Error('Session verification unavailable.'), { code: 'quick-login/unavailable' });
    await ports.validateSession(a);
  }
  async function activate(next: LockActor | null, releaseCapture = true) {
    trace('js_activate', { account: !!next, fresh: !!next?.credential });
    actor = next; const e = ++epoch;
    publish({ owner: next?.owner ?? null, session: next?.session ?? null, phase: 'loading', enabled: false, quickLogin: false, enrolled: false, canRestoreLock: false, quickLoginPending: false, passwordRequired: false, requireAfterSignIn: false, signInPending: false, canRestoreSignIn: false, busy: false, error: null, background: !active, verifiedLocallyAt: null });
    return serial(async () => {
      if (epoch !== e) return;
      if (!next) { if (releaseCapture) await cover(false).catch(() => {}); if (epoch === e) publish({ phase: 'ready' }); return; }
      try {
        const bg = backgroundEpoch;
        await ensureInstallation();
        const raw = await ports.read(lockKey(next.owner), false);
        if (!same(next, e)) return;
        if (raw !== null) {
          const value = JSON.parse(raw);
          if (![1, 2, 3].includes(value.schema) || value.owner !== next.owner || value.installation !== installation || value.pending !== false || !lockTimeouts.includes(value.timeoutMs)) throw new Error(errorText);
          if (value.schema === 3 && typeof value.enrolled !== 'boolean') throw new Error(errorText);
          publish({ enrolled: value.schema !== 3 || value.enrolled, canRestoreLock: !!next.credential && value.schema === 3 && !value.enrolled && (value.enabled || value.quickLogin) });
          if (value.schema === 1) {
            if (value.enabled !== true || (value.quickLogin !== undefined && typeof value.quickLogin !== 'boolean')) throw new Error(errorText);
            // Only the known legacy combined enrollment implies Quick Login.
            // Explicit false remains false; schema 2 always requires both flags.
            publish({ enabled: true, quickLogin: value.quickLogin ?? true, timeoutMs: value.timeoutMs });
          } else {
            if (typeof value.enabled !== 'boolean' || typeof value.quickLogin !== 'boolean') throw new Error(errorText);
            publish({ enabled: value.enabled, quickLogin: value.quickLogin, timeoutMs: value.timeoutMs });
          }
        }
        const extraRaw = await ports.read(signInKey(next.owner), false);
        if (!same(next, e)) return;
        let incomplete = false;
        if (extraRaw !== null) {
          // An unreadable policy is protection in need of repair, never OFF.
          // Only genuine fresh credentials plus a strong OS challenge may repair it.
          publish({ requireAfterSignIn: true, signInPending: true, canRestoreSignIn: !!next.credential });
          const value = JSON.parse(extraRaw);
          if (![1,2].includes(value.schema) || value.owner !== next.owner || value.installation !== installation || typeof value.enabled !== 'boolean' || (value.schema === 1 && value.enabled !== true) || typeof value.pending !== 'boolean' || (!value.enabled && value.pending)) throw new Error(errorText);
          publish({ requireAfterSignIn:value.enabled,signInPending:value.enabled,canRestoreSignIn:value.enabled && !!next.credential });
          incomplete = value.pending;
        }
        const pending = await ports.read(signInPendingKey, false);
        const needsSignIn = state.requireAfterSignIn && (!!next.credential || pending !== null || incomplete);
        if (!same(next, e)) return;
        publish({ signInPending: needsSignIn, canRestoreSignIn: needsSignIn && !!next.credential });
        if (needsSignIn) { await cover(true); await capability(); if (same(next, e)) publish({ phase: 'locked' }); return; }
        await clearSignInJournal();
        if (!same(next, e)) return;
        if (!state.enabled && !state.quickLogin) { await cover(false); if (same(next, e)) publish({ phase: 'ready', timeoutMs: raw === null ? 0 : state.timeoutMs }); return; }
        if (next.credential) {
          if (state.enabled && !state.enrolled) { await cover(true); if (same(next,e)) publish({ phase:'locked' }); return; }
          // Password authentication does not imply Quick Login. Only App Lock
          // adds the existing online gate; post-sign-in has its own branch above.
          if (state.enabled) {
            await cover(true); publish({ phase: 'checking', busy: true }); await verifySession(next);
          } else await cover(false);
          if (same(next, e)) publish({ phase: active && bg === backgroundEpoch ? 'ready' : state.enabled ? 'locked' : 'ready', busy: false });
          return;
        }
        await cover(true);
        await capability();
        if (same(next, e)) publish({ phase: 'locked', quickLoginPending: state.quickLogin, passwordRequired: false });
      } catch (error) { if (same(next, e)) { await cover(true).catch(() => {}); if (same(next, e)) publish({ phase: 'error', busy: false, error: (error as { code?: string })?.code === 'metadata_authentication_rejected' ? 'Saved security metadata unexpectedly requires authentication. The automatic prompt was blocked. Protected content remains closed; sign out safely or contact support.' : errorText }); } }
    });
  }
  function action(kind: 'enable' | 'unlock' | 'disable' | 'timeout' | 'quick-on' | 'quick-off' | 'recover' | 'resume' | 'sign-in-on' | 'sign-in-off' | 'sign-in-restore' | 'lock-restore', timeoutMs = 0) {
    trace('js_action_' + kind);
    const a = actor, e = epoch, bg = backgroundEpoch;
    if (!a || !same(a, e) || running || !active || state.phase === 'loading') return Promise.resolve();
    if (kind === 'enable' && (state.enabled || state.phase !== 'ready')) return Promise.resolve();
    if ((kind === 'disable' || kind === 'timeout') && (!state.enabled || state.phase !== 'ready')) return Promise.resolve();
    if (kind === 'unlock' && ((!state.enabled && !state.quickLoginPending && !state.signInPending) || state.phase !== 'locked' || state.passwordRequired)) return Promise.resolve();
    if (kind === 'unlock' && !state.signInPending && !state.enrolled) return Promise.resolve();
    if ((kind === 'quick-on' || kind === 'quick-off') && (state.phase !== 'ready' || (kind === 'quick-on') === state.quickLogin)) return Promise.resolve();
    if (kind === 'resume' && (!state.enabled || state.phase !== 'ready')) return Promise.resolve();
    if ((kind === 'sign-in-on' || kind === 'sign-in-off') && (state.phase !== 'ready' || state.signInPending || (kind === 'sign-in-on') === state.requireAfterSignIn)) return Promise.resolve();
    if (kind === 'sign-in-restore' && (!state.signInPending || !state.requireAfterSignIn || !a.credential || !['locked', 'error'].includes(state.phase))) return Promise.resolve();
    if (kind === 'lock-restore' && (!state.canRestoreLock || !a.credential || state.signInPending || !['ready','locked','error'].includes(state.phase))) return Promise.resolve();
    if (!lockTimeouts.includes(timeoutMs as typeof lockTimeouts[number])) return Promise.resolve();
    running = true; publish({ busy: true, error: null, ...(kind === 'resume' ? { phase: 'checking' as const } : {}) });
    return serial(async () => {
      let beganEnrollment = false, beganSignInSetup = false, beganSignInRemoval = false, beganPolicyChange = false;
      const originalEnabled = state.enabled, originalQuick = state.quickLogin, originalTimeout = state.timeoutMs;
      const assertSignInActionCurrent = () => { if (!same(a, e) || !active || bg !== backgroundEpoch) throw new Error('Fingerprint setup was interrupted.'); };
      const canPrompt = () => running && same(a,e) && active && bg === backgroundEpoch;
      const authorizePrompt = async (key: string, writing: boolean) => {
        assertSignInActionCurrent();
        const after = key === signInKey(a.owner,true);
        const raw = await ports.read(after ? signInKey(a.owner) : lockKey(a.owner),false);
        assertSignInActionCurrent();
        if (raw === null) throw new Error('The saved biometric setting is unavailable. No verification was started.');
        const p=JSON.parse(raw);
        if (p.owner !== a.owner || p.installation !== installation || typeof p.pending !== 'boolean') throw new Error(errorText);
        if (after) {
          if (![1,2].includes(p.schema) || p.enabled !== true || (writing && !p.pending)) throw new Error('The saved after-sign-in setting does not authorize this verification.');
        } else {
          if (![1,2,3].includes(p.schema) || typeof p.enabled !== 'boolean' || !lockTimeouts.includes(p.timeoutMs)
            || (p.schema === 1 ? p.enabled !== true || (p.quickLogin !== undefined && typeof p.quickLogin !== 'boolean') : typeof p.quickLogin !== 'boolean')
            || (p.schema === 3 && typeof p.enrolled !== 'boolean')) throw new Error(errorText);
          const quick = p.schema === 1 ? p.quickLogin ?? true : p.quickLogin;
          const allowed = kind === 'disable' || kind === 'timeout' ? p.enabled : kind === 'quick-off' ? quick
            : kind === 'unlock' ? p.enabled || (state.quickLoginPending && quick) : p.enabled || quick;
          if (!allowed || (!writing && (p.pending || (p.schema === 3 && !p.enrolled)))) throw new Error('The saved lock setting does not authorize this verification.');
        }
        assertSignInActionCurrent();
      };
      const readProof = async (key: string) => { await authorizePrompt(key,false); return ports.read(key,true,canPrompt); };
      const writeProof = async (key: string,value: string) => { await authorizePrompt(key,true); await ports.write(key,value,true,canPrompt); };
      try {
        if (!same(a, e) || !active) return;
        if (kind === 'recover') { await ports.signOut(); return; }
        if (kind === 'resume') {
          await verifySession(a);
          if (same(a, e) && active && bg === backgroundEpoch) publish({ phase: 'ready' });
          return;
        }
        await capability();
        if (!canPrompt()) return;
        if (kind === 'lock-restore') {
          await verifySession(a); assertSignInActionCurrent();
          // Preserve chosen switches while replacing only the revoked proof.
          await writeProof(lockKey(a.owner,true),proof(a));
          assertSignInActionCurrent(); await verifySession(a); assertSignInActionCurrent();
          beganPolicyChange=true;
          await writePlain(lockKey(a.owner),metadata(a,state.timeoutMs,false,state.quickLogin,state.enabled,true));
          assertSignInActionCurrent();
          publish({ enrolled:true,canRestoreLock:false,quickLoginPending:false,phase:'ready',verifiedLocallyAt:ports.now() });
          await cover(state.enabled); return;
        }
        if (kind === 'sign-in-on' || kind === 'sign-in-off' || kind === 'sign-in-restore') {
          const restoring = kind === 'sign-in-restore';
          if (restoring) await verifySession(a);
          assertSignInActionCurrent();
          if (kind === 'sign-in-off') {
            const value = await readProof(signInKey(a.owner, true));
            if (value !== signInProof(a)) throw new Error(errorText);
          } else {
            beganSignInSetup = true;
            await writePlain(signInKey(a.owner), signInPolicy(a, true));
            await writeProof(signInKey(a.owner, true), signInProof(a));
          }
          assertSignInActionCurrent();
          await verifySession(a);
          assertSignInActionCurrent();
          if (kind === 'sign-in-off') { beganSignInRemoval = true; await writePlain(signInKey(a.owner),signInPolicy(a,false,false)); await ports.remove(signInKey(a.owner,true),true); }
          else await writePlain(signInKey(a.owner), signInPolicy(a));
          if (!same(a, e)) return;
          if (restoring) await clearSignInJournal();
          if (!same(a, e)) return;
          publish({ requireAfterSignIn: kind !== 'sign-in-off', signInPending: false, canRestoreSignIn: false, phase: state.enabled && !state.enrolled ? 'locked' : active && bg === backgroundEpoch ? 'ready' : state.enabled ? 'locked' : 'ready' });
          await cover(state.enabled);
          return;
        }
        if ((kind === 'enable' || kind === 'quick-on') && !originalEnabled && !originalQuick) {
          await cover(true);
          beganEnrollment = true;
          // Journal before the authenticated write: a crash never turns partial enrollment into 'off'.
          const enabled = kind === 'enable', quickLogin = kind === 'quick-on';
          const nextTimeout = enabled ? timeoutMs : originalTimeout;
          await writePlain(lockKey(a.owner), metadata(a, nextTimeout, true, quickLogin, enabled, false));
          await writeProof(lockKey(a.owner, true), proof(a));
          if (!same(a, e)) { await removePolicy(a.owner); return; }
          assertSignInActionCurrent();
          await verifySession(a);
          if (!same(a, e)) { await removePolicy(a.owner); return; }
          assertSignInActionCurrent();
          await writePlain(lockKey(a.owner), metadata(a, nextTimeout, false, quickLogin, enabled, true));
          if (!same(a, e)) { await removePolicy(a.owner); return; }
          publish({ enabled, quickLogin, enrolled: true, canRestoreLock:false, quickLoginPending: false, passwordRequired: false, timeoutMs: nextTimeout, phase: active && bg === backgroundEpoch ? 'ready' : enabled ? 'locked' : 'ready', verifiedLocallyAt: ports.now() });
          await cover(enabled);
        } else {
          const afterSignIn = kind === 'unlock' && state.signInPending;
          const value = await readProof(afterSignIn ? signInKey(a.owner, true) : lockKey(a.owner, true));
          if (value !== (afterSignIn ? signInProof(a) : proof(a))) throw new Error('Biometric enrollment is missing or changed. Use sign-out and your Firebase sign-in to recover.');
          if (!same(a, e) || !active || bg !== backgroundEpoch) return;
          await verifySession(a);
          if (!same(a, e) || !active || bg !== backgroundEpoch) return;
          if (kind === 'unlock') {
            if (afterSignIn) { await writePlain(signInKey(a.owner), signInPolicy(a)); await clearSignInJournal(); }
            if (!same(a, e) || !active || bg !== backgroundEpoch) return;
            awayAt = null; publish({ phase: afterSignIn && state.enabled && !state.enrolled ? 'locked' : 'ready', quickLoginPending: false, signInPending: false, canRestoreSignIn: false, verifiedLocallyAt: ports.now() });
            await cover(state.enabled);
          }
          if (kind === 'enable' || kind === 'disable' || kind === 'timeout' || kind === 'quick-on' || kind === 'quick-off') {
            const quickLogin = kind === 'timeout' ? state.quickLogin : kind === 'quick-on';
            const nextQuick = kind === 'quick-on' || kind === 'quick-off' ? quickLogin : originalQuick;
            const enabled = kind === 'enable' ? true : kind === 'disable' ? false : originalEnabled;
            const nextTimeout = kind === 'timeout' || kind === 'enable' ? timeoutMs : originalTimeout;
            // Persist explicit OFF flags. Disabling App Lock cannot erase an
            // independent Quick Login setting, nor vice versa.
            beganPolicyChange = true;
            await writePlain(lockKey(a.owner), metadata(a, nextTimeout, false, nextQuick, enabled));
            if (same(a, e)) {
              await cover(enabled);
              if (!same(a, e)) return;
              publish({ enabled, quickLogin: nextQuick, quickLoginPending: false, timeoutMs: nextTimeout,
                phase: enabled && (!active || bg !== backgroundEpoch) ? 'locked' : 'ready', verifiedLocallyAt: ports.now() });
            }
          }
        }
      } catch (error) {
        const sessionMessage = sessionErrorMessage(error);
        if (kind === 'sign-in-on') {
          if (beganSignInSetup) {
            try { await removeSignInPolicy(a.owner); }
            catch { if (same(a, e)) publish({ phase: 'error', requireAfterSignIn: true, signInPending: true, error: errorText }); return; }
          }
          if (same(a, e)) publish({ requireAfterSignIn: false, error: sessionMessage || 'Fingerprint-after-sign-in was not enabled. Try again when strong biometrics and Firebase are available.' });
        } else if (kind === 'sign-in-off' && !beganSignInRemoval && !sessionMessage) {
          // The settings screen was already unlocked. Canceling an OFF challenge
          // leaves the requirement ON; it never grants access to a locked gate.
          if (same(a, e)) publish({ error: 'The fingerprint requirement is still enabled. Device verification was not completed.' });
        } else if (kind === 'sign-in-restore' || kind === 'sign-in-off') {
          if (same(a, e)) publish({ phase: 'locked', signInPending: true, canRestoreSignIn: !!a.credential, error: sessionMessage || errorText });
        } else if (beganEnrollment) {
          // Keep the crash-pending journal when Firebase cannot confirm identity.
          // Retrying policy activation must not turn an online failure into an unlocked portal.
          if (sessionMessage) { if (same(a, e)) publish({ enabled: kind === 'enable', quickLogin: kind === 'quick-on', phase: 'error', error: sessionMessage }); return; }
          try { await removePolicy(a.owner); if (same(a, e)) { await cover(false); publish({ enabled: false, quickLogin: false, phase: 'ready', error: 'Biometric enrollment was not completed. Local protection remains off.' }); } }
          catch { if (same(a, e)) publish({ enabled: true, phase: 'error', error: errorText }); }
        } else if (beganPolicyChange && same(a, e)) {
          publish({ phase: 'error', error: 'The security setting could not be confirmed in storage. Protected content remains closed. Retry the saved policy check.' });
        } else if ((kind === 'quick-on' || kind === 'quick-off' || kind === 'disable') && !sessionMessage && same(a, e)) {
          publish({ error: 'The saved setting was not changed. Device verification or secure saving was not completed.' });
        } else if (same(a, e)) {
          const message = sessionMessage || (error instanceof Error && (error.message.startsWith('Strong ') || error.message.startsWith('Biometric enrollment')) ? error.message : errorText);
          publish({ ...(kind === 'enable' ? {} : { phase: state.enabled || state.signInPending || state.quickLoginPending ? 'locked' as const : 'error' as const }), error: message });
        }
      } finally { running = false; if (same(a, e)) publish({ busy: false }); }
    });
  }
  function lifecycle(value: 'active' | 'inactive' | 'background') {
    trace('js_lifecycle', { lifecycle: value });
    const wasActive = active; active = value === 'active';
    if (!active && wasActive) awayAt = ports.now();
    if (value === 'inactive' && running) promptOnlyInterruption = true;
    if (value === 'background') { backgroundEpoch++; promptOnlyInterruption = false; }
    let locked = state.phase !== 'ready' && state.phase !== 'checking';
    if (state.phase === 'checking' && value === 'background') locked = true;
    if (state.enabled && awayAt !== null && !(running && promptOnlyInterruption)) {
      const elapsed = ports.now() - awayAt;
      locked = locked || state.timeoutMs === 0 || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= state.timeoutMs;
    }
    // Start checking while the old background shield is still present. No observer
    // can see ready + foreground between resuming and the online verification.
    if (active && !wasActive && state.enabled && !locked && state.phase === 'ready' && !running) void action('resume');
    publish({ background: !active, ...(state.enabled && locked ? { phase: state.phase === 'error' ? 'error' : 'locked' } : {}) });
    if (active) awayAt = null;
    if (active) promptOnlyInterruption = false;
  }
  return { activate, lifecycle, prepareSignIn, restoreLockEnrollment: () => action('lock-restore'), setRequireAfterSignIn: (required: boolean) => action(required ? 'sign-in-on' : 'sign-in-off'), restoreSignInFingerprint: () => action('sign-in-restore'), subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, getSnapshot: () => state,
    enable: (timeoutMs = 0) => action('enable', timeoutMs), setQuickLogin: (enabled: boolean) => action(enabled ? 'quick-on' : 'quick-off'), unlock: () => action('unlock'), disable: () => action('disable'), setTimeout: (ms: number) => action('timeout', ms), recover: () => action('recover'),
    forget(owner: string) {
      if (ports.actor()?.owner === owner) return Promise.reject(new Error('Cannot clear a signed-in account policy without biometric verification.'));
      cleanupPending.add(owner);
      return serial(async () => { if (ports.actor()?.owner === owner) return; try { await revokeEnrollment(owner); cleanupPending.delete(owner); publish({ cleanupError: cleanupPending.size ? state.cleanupError : null }); }
        catch (error) { publish({ cleanupError: 'Firebase sign-out completed, but local lock cleanup could not finish. Existing protection is retained. Retry cleanup before signing in again.' }); throw error; } });
    },
    retryCleanup() { if (ports.actor()) return Promise.resolve(); return serial(async () => { for (const owner of [...cleanupPending]) { if (ports.actor()) return; try { await revokeEnrollment(owner); cleanupPending.delete(owner); } catch { return; } } publish({ cleanupError: cleanupPending.size ? state.cleanupError : null }); }); },
    settled: () => work,
  };
}
