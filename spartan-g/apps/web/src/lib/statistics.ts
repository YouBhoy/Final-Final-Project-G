import { getFunctions, httpsCallable } from 'firebase/functions';
import type { StatisticsFilters, StatisticsReport } from '@spartan-g/shared-types';
import { app } from '../firebase/firebase';

export async function loadStatistics(filters: StatisticsFilters): Promise<StatisticsReport> {
  const response = await httpsCallable<StatisticsFilters, StatisticsReport>(getFunctions(app), 'getAdminStatistics', { timeout: 120000 })(filters);
  return response.data;
}
export function statisticsError(cause: unknown): string {
  const code = (cause as { code?: string })?.code;
  if (code === 'functions/permission-denied' || code === 'functions/unauthenticated') return 'Statistics access requires an active super administrator. Sign in again or contact your administrator.';
  if (code === 'functions/not-found' || code === 'functions/unavailable' || code === 'functions/internal') return 'The statistics report service is unavailable. The getAdminStatistics backend must be running locally or deployed before reports can load.';
  if (code === 'functions/deadline-exceeded') return 'The report took too long to load. Try refreshing or choose a shorter period.';
  return cause instanceof Error ? cause.message : 'Unable to load statistics. Please try again.';
}
