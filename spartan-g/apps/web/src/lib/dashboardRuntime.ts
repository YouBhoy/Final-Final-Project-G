import { collection, doc, getDocFromServer, onSnapshot, query, where } from 'firebase/firestore';
import { appointmentService } from '@spartan-g/shared-services';
import { auth, db } from '../firebase/firebase';
import { hasPortalTabSession } from './adminTabSession';
import { createDashboardCache, DashboardDataError, scopeKey, type DashboardScope } from './dashboardData';

let session: DashboardScope | null = null;
type DashboardObserver = { changed: () => void; failed: (section: string, cause: unknown) => void };
const watchers = new Map<string, { observers: Set<DashboardObserver>; stop: () => void }>();
let profileStop: (() => void) | null = null;

const tabChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('spartan-g-session') : null;

tabChannel?.addEventListener('message', event => {
  const scope = event.data?.scope as string | null | undefined;
  if (scope === undefined) return;
  if ((session ? scopeKey(session) : null) !== scope) {
    dashboardCache.clear();
    profileReads.clear();
    profileStop?.();
    profileStop = null;
    for (const entry of [...watchers.values()]) entry.stop();
    watchers.clear();
  }
});
export function dashboardScope(uid: string, role: DashboardScope['role']): DashboardScope {
  return { project: db.app.options.projectId ?? '', database: '(default)', uid, role };
}
function assertCurrent(scope: DashboardScope) {
  if (!session || scopeKey(scope) !== scopeKey(session) || auth.currentUser?.uid !== scope.uid || !hasPortalTabSession(scope.uid))
    throw new DashboardDataError('session-expired');
}
// Coalesce simultaneous authorization reads only; never cache an allow decision.
const profileReads = new Map<string, Promise<void>>();
async function authorize(scope: DashboardScope) {
  assertCurrent(scope);
  const key = scopeKey(scope);
  let operation = profileReads.get(key);
  if (!operation) {
    operation = (async () => {
      const profile = await getDocFromServer(doc(db, 'users', scope.uid));
      assertCurrent(scope);
      if (!profile.exists() || profile.data().isActive !== true || profile.data().role !== scope.role)
        throw new DashboardDataError('permission-denied');
    })();
    profileReads.set(key, operation);
  }
  try { await operation; assertCurrent(scope); }
  finally { if (profileReads.get(key) === operation) profileReads.delete(key); }
}
export const dashboardCache = createDashboardCache({ current: () => session, authorize });
/** Called synchronously by portal auth transitions, including failed logout/idle expiry. */
export function setDashboardSession(user: { uid: string; role: DashboardScope['role'] } | null) {
  const next = user ? dashboardScope(user.uid, user.role) : null;
  const previousKey = session ? scopeKey(session) : null;
  const nextKey = next ? scopeKey(next) : null;
  if (nextKey !== previousKey) {
    dashboardCache.clear(); profileReads.clear();
    profileStop?.();
    profileStop = null;
    for (const entry of [...watchers.values()]) entry.stop();
    watchers.clear();
  }
  session = next;
  tabChannel?.postMessage({ scope: nextKey });

  if (next && nextKey !== previousKey) {
    try {
      profileStop = onSnapshot(doc(db, 'users', next.uid), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.fromCache) return;
        const data = snapshot.data();
        if (!snapshot.exists() || data?.isActive !== true || data.role !== next.role) {
          setDashboardSession(null);
        }
      }, () => {
        // Permission/listener failures fail closed and invalidate sensitive data.
        setDashboardSession(null);
      });
    } catch {
      setDashboardSession(null);
    }
  }
}
export function readDashboardAppointments(scope: DashboardScope) {
  return dashboardCache.read(scope, 'appointments', () => {
    if (scope.role === 'student') return appointmentService.getStudentAppointments(scope.uid, scope.role);
    if (scope.role === 'facilitator') return appointmentService.getAppointments(scope.uid, scope.role);
    throw new DashboardDataError('permission-denied');
  }); // In-flight reuse only: appointments never have a result TTL.
}

/** One account-scoped listener set shared across simultaneous dashboard consumers. */
export function watchDashboard(scope: DashboardScope, changed: () => void, failed: (section: string, cause: unknown) => void) {
  assertCurrent(scope);
  const key = scopeKey(scope), observer = { changed, failed };
  let entry = watchers.get(key);
  if (entry) {
    entry.observers.add(observer);
  } else {
    let active = true, queued = false;
    const observers = new Set<DashboardObserver>([observer]);
    const stops: (() => void)[] = [];
    const focus = () => { if (active) { dashboardCache.invalidate(scope); notify(); } };
    const stop = () => {
      active = false; stops.forEach(unsubscribe => unsubscribe());
      if (typeof window !== 'undefined') window.removeEventListener('focus', focus);
      watchers.delete(key);
    };
    entry = { observers, stop }; watchers.set(key, entry);
    const notify = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (active) observers.forEach(item => item.changed()); });
    };
    const sources = [
      ['appointments', 'appointments', scope.role === 'student' ? 'studentId' : 'facilitatorId'],
      ['notifications', 'notifications', 'userId'],
      ...(scope.role === 'student' ? [['assessments', 'assessment_attempts', 'studentId']] : []),
    ];
    try {
      for (const [section, name, field] of sources) {
        let initialized = false;
        stops.push(onSnapshot(query(collection(db, name), where(field, '==', scope.uid)), { includeMetadataChanges: true }, snapshot => {
          if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
          if (initialized) { dashboardCache.invalidate(scope, section); notify(); }
          initialized = true;
        }, cause => {
          if (active) { dashboardCache.invalidate(scope, section); observers.forEach(item => item.failed(section, cause)); }
        }));
      }
      if (typeof window !== 'undefined') window.addEventListener('focus', focus);
    } catch (cause) { stop(); throw cause; }
  }
  const shared = entry;
  return () => {
    shared.observers.delete(observer);
    if (!shared.observers.size && watchers.get(key) === shared) shared.stop();
  };
}
