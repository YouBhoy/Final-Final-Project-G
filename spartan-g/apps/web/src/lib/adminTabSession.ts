export const PORTAL_IDLE_MS = 15 * 60 * 1000;
const KEY = 'spartan-g:portal-tab-session:v1';
type TabSession = { uid: string; lastActivityAt: number };

function readSession(uid: string, now = Date.now()): TabSession | null {
  try {
    const session = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as TabSession | null;
    if (!session || session.uid !== uid || !Number.isFinite(session.lastActivityAt)
      || session.lastActivityAt > now || now - session.lastActivityAt >= PORTAL_IDLE_MS) return null;
    return session;
  } catch { return null; }
}

/** This marker controls local session lifetime; Firebase rules still authorize requests. */
export function hasPortalTabSession(uid: string, now = Date.now()): boolean {
  return readSession(uid, now) !== null;
}

export function beginPortalTabSession(uid: string, now = Date.now()) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ uid, lastActivityAt: now }));
    if (!hasPortalTabSession(uid, now)) throw new Error('Tab storage unavailable');
  } catch {
    throw new Error('Secure portal sign-in requires browser tab storage. Allow site storage and sign in again.');
  }
}

export function clearPortalTabSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* A missing marker always denies restoration. */ }
}

/** Wall-clock checks prevent background throttling, sleep or refresh from extending a session. */
export function monitorPortalIdle(uid: string, expire: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
  function finish() {
    if (stopped) return;
    stop();
    clearPortalTabSession();
    expire();
  }
  function schedule() {
    if (stopped) return;
    const now = Date.now(), session = readSession(uid, now);
    if (!session) { finish(); return; }
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(schedule, PORTAL_IDLE_MS - (now - session.lastActivityAt));
  }
  function activity(event: Event) {
    if (stopped || !event.isTrusted || document.hidden) return;
    const now = Date.now(), session = readSession(uid, now);
    // Check expiry before accepting an interaction, including the first click after sleep.
    if (!session) { finish(); return; }
    // Avoid writing sessionStorage on every mouse-move event.
    if (now - session.lastActivityAt >= 1000) {
      try { beginPortalTabSession(uid, now); } catch { finish(); return; }
      schedule();
    }
  }
  function stop() {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    for (const event of activityEvents) window.removeEventListener(event, activity);
    window.removeEventListener('focus', schedule);
    window.removeEventListener('pageshow', schedule);
    document.removeEventListener('visibilitychange', schedule);
  }
  for (const event of activityEvents) window.addEventListener(event, activity, { passive: true });
  window.addEventListener('focus', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return stop;
}

// Preserve existing imports while applying the same policy to every web portal.
export { PORTAL_IDLE_MS as ADMIN_IDLE_MS, hasPortalTabSession as hasAdminTabSession,
  beginPortalTabSession as beginAdminTabSession, clearPortalTabSession as clearAdminTabSession,
  monitorPortalIdle as monitorAdminIdle };
