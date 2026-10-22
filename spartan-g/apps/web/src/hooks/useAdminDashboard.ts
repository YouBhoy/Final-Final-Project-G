import { useEffect, useState } from 'react';
import { auditService, campusRepository, userRepository } from '@spartan-g/shared-services';
import type { CampusDocument } from '@spartan-g/shared-types';
import { createPseudonymizer, pseudonymizeAuditRows, type AuditDisplayRow } from '../lib/pseudonymization';
import { dashboardMonth, type DashboardUser } from '../lib/adminDashboard';
import { loadStatistics, statisticsError } from '../lib/statistics';

type Section<T> = { data: T | null; loading: boolean; error: string | null };
const initial = <T,>(): Section<T> => ({ data: null, loading: true, error: null });

/** Each source can fail independently; never present a failed read as zero. */
export function useAdminDashboard() {
  const [revision, setRevision] = useState(0);
  const [users, setUsers] = useState(initial<DashboardUser[]>);
  const [campuses, setCampuses] = useState(initial<CampusDocument[]>);
  const [activity, setActivity] = useState(initial<AuditDisplayRow[]>);
  const [submissions, setSubmissions] = useState(initial<number>);
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
    void read(async () => pseudonymizeAuditRows(await auditService.listRecent(6)), setActivity);
    void read(async () => (await loadStatistics({ ...dashboardMonth(), campus: '', assessmentId: '', interval: 'monthly' }, { forceRefresh: revision > 0 })).totals.submissions, setSubmissions);
    return () => { cancelled = true; };
  }, [revision]);
  return { users, campuses, activity, submissions, refresh: () => setRevision(value => value + 1), loading: [users, campuses, activity, submissions].some(section => section.loading) };
}
