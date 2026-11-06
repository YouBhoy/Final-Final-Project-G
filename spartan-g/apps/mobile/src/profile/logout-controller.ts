export type LogoutStage = 'idle' | 'walk' | 'open' | 'exit' | 'goodbye' | 'signing-out' | 'error';
export interface LogoutState { busy: boolean; stage: LogoutStage; error: string | null }
interface LogoutPorts {
  owner: string;
  getOwner(): string | null;
  signOut(): Promise<void>;
  play(stage: (stage: LogoutStage) => void): Promise<void>;
  stop(): void;
  changed(state: LogoutState): void;
}
/** Visuals have a bounded lead-in; only the established Auth operation signs out. */
export function createLogoutController(ports: LogoutPorts) {
  let running = false, disposed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let releaseVisual: (() => void) | null = null;
  const emit = (state: LogoutState) => { if (!disposed) ports.changed(state); };
  async function confirm() {
    if (running || disposed || ports.getOwner() !== ports.owner) return;
    running = true;
    emit({ busy: true, stage: 'walk', error: null });
    try {
      await Promise.race([
        Promise.resolve().then(() => disposed ? undefined : ports.play(stage => emit({ busy: true, stage, error: null }))).catch(() => { /* Visual failure never prevents confirmed sign-out. */ }),
        new Promise<void>(resolve => { releaseVisual = resolve; timeout = setTimeout(() => { ports.stop(); resolve(); }, 2200); }),
      ]);
      clearTimeout(timeout);
      if (ports.getOwner() !== ports.owner) return;
      emit({ busy: true, stage: 'signing-out', error: null });
      await ports.signOut();
      // No manual navigation/session mutation: Firebase observer/root routing is authoritative.
    } catch {
      if (ports.getOwner() === ports.owner) emit({ busy: false, stage: 'error', error: 'Could not sign out. Your session is still active. Please try again.' });
    } finally { clearTimeout(timeout); releaseVisual = null; running = false; }
  }
  return { confirm, isBusy: () => running, dispose() { disposed = true; ports.stop(); releaseVisual?.(); clearTimeout(timeout); /* A confirmed operation still completes for the same owner. */ } };
}
