import { onAuthStateChanged } from 'firebase/auth';
import { buildStatistics, validateFilters, type StatisticsFilters, type StatisticsReport } from '@spartan-g/shared-types';
import { auth, db } from '../firebase/firebase';
import { createStatisticsLoader } from './statisticsData';
import { createFirestoreStatisticsSource } from './statisticsSource';

const loader = createStatisticsLoader(createFirestoreStatisticsSource(db, () => auth.currentUser?.uid ?? null));
let account = auth.currentUser?.uid ?? null;
const unsubscribe = onAuthStateChanged(auth, user => {
  if (account !== (user?.uid ?? null)) loader.clear();
  account = user?.uid ?? null;
});
if (import.meta.hot) import.meta.hot.dispose(unsubscribe);

export async function loadStatistics(filters: StatisticsFilters, options: { forceRefresh?: boolean } = {}): Promise<StatisticsReport> {
  const validated = validateFilters(filters);
  const input = await loader.input(options.forceRefresh);
  return { ...buildStatistics(input, validated), sourceLoadedAt: loader.loadedAt(input) };
}
export function statisticsError(cause: unknown): string {
  const code = (cause as { code?: string })?.code;
  if (code === 'permission-denied' || code === 'unauthenticated') return 'Statistics requires an active super administrator and permission to read report sources. Sign in again or ask your administrator to check the Firestore rules.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'Unable to reach Firebase. Check your connection and refresh this tab; no partial report is shown.';
  if (code === 'resource-exhausted') return 'Firebase\u2019s database usage limit has been reached. Try again when the quota resets; no billing upgrade is required to keep this implementation.';
  return cause instanceof Error ? cause.message : 'Unable to load statistics. Please try again.';
}
