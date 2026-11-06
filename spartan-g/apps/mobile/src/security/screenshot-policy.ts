/** Screenshot permission is separate from authentication and biometric access. */
export const presentationScreens = ['StudentHome', 'StudentGarden', 'Forest', 'StudentResources'] as const;
export const isPresentationScreen = (name: string) => (presentationScreens as readonly string[]).includes(name);
// Additional student routes only in the native private documentation build,
// after session consent. Auth, staff and unknown routes stay protected.
const documentationScreens = ['StudentCourses', 'StudentAssignments', 'StudentAppointments', 'StudentMessages', 'StudentProfile',
  'Notifications', 'CourseDetail', 'AssignmentDetail', 'ConversationDetail', 'AssessmentWizard', 'BookAppointment'];
export type CaptureState = { protected: boolean; ready: boolean; error: boolean };

export function createCapturePolicy(writeProtection: (enabled: boolean) => Promise<void>, verifiedReady: () => boolean, privateDocumentation: () => boolean = () => false) {
  const screens = new Map<symbol, string>(), overlays = new Set<symbol>(), transitions = new Set<string>();
  const listeners = new Set<() => void>();
  let foreground = false, requested: boolean | null = null, applied: boolean | null = null, version = 0;
  let work: Promise<void> = Promise.resolve();
  let state: CaptureState = { protected: false, ready: false, error: false };
  const publish = (next: CaptureState) => { state = next; listeners.forEach(listener => listener()); };
  const mustProtect = () => {
    let ready = false;
    try { ready = verifiedReady() === true; } catch { /* Unknown identity stays private. */ }
    const documentation = privateDocumentation() === true;
    return !foreground || !ready || (overlays.size > 0 && !documentation) || transitions.size > 0 ||
      screens.size === 0 || [...screens.values()].some(name => !isPresentationScreen(name) && !(documentation && documentationScreens.includes(name)));
  };
  function refresh(): Promise<void> {
    const next = mustProtect();
    if (next === requested && !state.error) return work;
    requested = next;
    const revision = ++version;
    // A previously requested allow may still be in flight. Protected content
    // must wait for a current, acknowledged native protection operation.
    publish({ protected: false, ready: false, error: false });
    const operation = work.catch(() => {}).then(async () => {
      if (revision !== version) return;
      const target = mustProtect();
      try {
        if (applied !== target) await writeProtection(target);
        applied = target;
        if (revision === version) publish({ protected: target, ready: true, error: false });
      } catch {
        applied = null;
        if (revision === version) publish({ protected: false, ready: false, error: true });
        throw new Error('Screen privacy could not be confirmed.');
      }
    });
    work = operation;
    return operation;
  }
  const safelyRefresh = () => { void refresh().catch(() => {}); };
  const enter = (name: string) => {
    const token = Symbol(); screens.set(token, name); safelyRefresh();
    return () => { screens.delete(token); safelyRefresh(); };
  };
  return {
    refresh,
    enterScreen: enter,
    enterSensitiveOverlay() { const token = Symbol(); overlays.add(token); safelyRefresh(); return () => { overlays.delete(token); safelyRefresh(); }; },
    foreground(active: boolean) { foreground = active; safelyRefresh(); },
    transition(key: string, running: boolean) { if (running) transitions.add(key); else transitions.delete(key); safelyRefresh(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
  };
}
