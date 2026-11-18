import { useEffect, useState } from 'react';
import { campusRepository, userRepository } from '@spartan-g/shared-services';
import type { CampusDocument, ParticipationSummary } from '@spartan-g/shared-types';
import { createPseudonymizer } from '../lib/pseudonymization';
import { dashboardMonth, type DashboardUser } from '../lib/adminDashboard';
import { loadStatistics, statisticsError } from '../lib/statistics';

type Section<T> = { data: T | null; loading: boolean; error: string | null };
const initial = <T,>(): Section<T> => ({ data: null, loading: true, error: null });

/** Each source can fail independently; never present a failed read as zero. */
export function useAdminDashboard() {
  const [revision, setRevision] = useState(0);
  const [users, setUsers] = useState(initial<DashboardUser[]>);
  const [campuses, setCampuses] = useState(initial<CampusDocument[]>);
  const [statistics, setStatistics] = useState(initial<ParticipationSummary>);
  useEffect(() => {
    let cancelled = false;
    async function read<T>(load: () => Promise<T>, update: (value: Section<T>) => void) {
      update(initial<T>());
      try {
        const data = await load();
        if (!cancelled) update({ data, loading: false, error: null });
      } catch (cause) {
        if (!cancelled) update({ data: null, loading: false, error: statisticsError(cause) });
      }
    }
    void read(async () => {
      const alias = createPseudonymizer();
      return (await userRepository.getAll()).map(user => ({
        id: alias('Account', user.id), role: user.role, campus: user.campus, isActive: user.isActive,
      }));
    }, setUsers);
    void read(() => campusRepository.getAllCampuses(), setCampuses);
    void read(async () => (await loadStatistics({ ...dashboardMonth(), campus: '', assessmentId: '', interval: 'monthly' }, { forceRefresh: revision > 0 })).totals, setStatistics);
    return () => { cancelled = true; };
  }, [revision]);
  const submissions = { ...statistics, data: statistics.data?.submissions ?? null };
  return { users, campuses, submissions, statistics, refresh: () => setRevision(value => value + 1), loading: [users, campuses, statistics].some(section => section.loading) };
}
