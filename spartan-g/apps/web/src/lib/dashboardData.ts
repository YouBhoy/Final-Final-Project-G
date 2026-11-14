/** Browser-memory data only. Authorization is checked again even on cache hits. */
export interface DashboardScope {
  project: string;
  database: string;
  uid: string;
  role: 'student' | 'facilitator' | 'super_admin';
}
export const SUMMARY_FRESHNESS_MS = 15 * 60 * 1000;
export class DashboardDataError extends Error {
  constructor(public code: string) { super(code); }
}
export const scopeKey = (scope: DashboardScope) => JSON.stringify([scope.project, scope.database, scope.uid, scope.role]);

export function dashboardError(cause: unknown): string {
  // Repository wrappers may retain the Firebase code only in the cause/message.
  // Use that text to classify, never to render or log it.
  const error = cause as { code?: string; message?: string; cause?: unknown } | null;
  const classification = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (/unauthenticated|auth\/(?:user-token-expired|invalid-user-token|user-disabled)|session-expired/.test(classification))
    return 'Your session has expired. Sign in again to refresh this information.';
  if (/permission-denied|PermissionError|permission|access-denied/i.test(classification))
    return 'This information is unavailable for your account. Sign in again or contact your administrator.';
  if (/unavailable|deadline-exceeded|network|offline/i.test(classification))
    return 'Unable to connect. Check your connection and retry.';
  if (/resource-exhausted|quota/i.test(classification))
    return 'This information is temporarily unavailable. Please try again later.';
  return error?.cause ? dashboardError(error.cause) : 'Unable to load this information. Please retry.';
}

export function createDashboardCache(options: {
  current: () => DashboardScope | null;
  authorize: (scope: DashboardScope) => Promise<void>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let generation = 0;
  const revisions = new Map<string, number>();
  const cached = new Map<string, { value: unknown; loadedAt: number }>();
  const pending = new Map<string, Promise<unknown>>();
  const key = (scope: DashboardScope, query: string) => `${scopeKey(scope)}:${query}`;
  const clear = () => { generation++; cached.clear(); pending.clear(); revisions.clear(); };
  function invalidate(scope: DashboardScope, query?: string) {
    const prefix = query ? key(scope, query) : `${scopeKey(scope)}:`;
    for (const name of new Set([...cached.keys(), ...pending.keys(), ...revisions.keys()])) {
      if (name.startsWith(prefix)) {
        revisions.set(name, (revisions.get(name) ?? 0) + 1);
        cached.delete(name); pending.delete(name);
      }
    }
  }
  async function read<T>(scope: DashboardScope, query: string, load: () => Promise<T>, ttlMs = 0): Promise<T> {
    const name = key(scope, query), epoch = generation, revision = revisions.get(name) ?? 0;
    revisions.set(name, revision);
    const current = () => {
      const active = options.current();
      if (!active || scopeKey(active) !== scopeKey(scope) || epoch !== generation)
        throw new DashboardDataError('session-expired');
      if (revision !== (revisions.get(name) ?? 0)) throw new DashboardDataError('superseded');
    };
    const authorized = async () => {
      try { await options.authorize(scope); }
      catch (cause) { if (epoch === generation && revision === (revisions.get(name) ?? 0)) cached.delete(name); throw cause; }
      current();
    };
    current();
    await authorized();
    const entry = cached.get(name);
    let operation = pending.get(name) as Promise<T> | undefined;
    if (ttlMs > 0 && entry && now() - entry.loadedAt < Math.min(ttlMs, SUMMARY_FRESHNESS_MS)) {
      await authorized();
      return entry.value as T;
    }
    if (!operation) {
      operation = (async () => {
        const value = await load();
        current();
        await authorized();
        if (ttlMs > 0) cached.set(name, { value, loadedAt: now() });
        return value;
      })();
      pending.set(name, operation);
    }
    try {
      const value = await operation;
      current();
      // A joining caller also rechecks current server authorization.
      await authorized();
      return value;
    } catch (cause) {
      if (pending.get(name) === operation) cached.delete(name);
      throw cause;
    } finally {
      if (pending.get(name) === operation) pending.delete(name);
    }
  }
  return { read, invalidate, clear };
}

/** Stable input ordering, bounded concurrency, no retries, no partial totals. */
export async function mapDashboardReads<T, U>(rows: readonly T[], load: (row: T) => Promise<U>, maximum = 4): Promise<U[]> {
  if (!Number.isInteger(maximum) || maximum < 1) throw new Error('Invalid concurrency');
  const result = new Array<U>(rows.length);
  let next = 0, failed = false;
  await Promise.all(Array.from({ length: Math.min(maximum, rows.length) }, async () => {
    while (!failed && next < rows.length) {
      const index = next++;
      try { result[index] = await load(rows[index]); }
      catch (cause) { failed = true; throw cause; }
    }
  }));
  return result;
}
