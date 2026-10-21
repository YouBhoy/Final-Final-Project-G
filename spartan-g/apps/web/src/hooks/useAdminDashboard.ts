import { useEffect, useState } from 'react';
import { auditService, campusRepository, facilitatorStudentLinkRepository, userRepository } from '@spartan-g/shared-services';
import type { AuditLogDocument, CampusDocument, FacilitatorStudentLinkDocument } from '@spartan-g/shared-types';
import { dashboardMonth, type DashboardUser } from '../lib/adminDashboard';
import { loadStatistics, statisticsError } from '../lib/statistics';

type Section<T> = { data: T | null; loading: boolean; error: string | null };
const initial = <T,>(): Section<T> => ({ data: null, loading: true, error: null });

/** Each source can fail independently; never present a failed read as zero. */
export function useAdminDashboard() {
  const [revision, setRevision] = useState(0);
  const [users, setUsers] = useState(initial<DashboardUser[]>);
  const [campuses, setCampuses] = useState(initial<CampusDocument[]>);
  const [links, setLinks] = useState(initial<FacilitatorStudentLinkDocument[]>);
  const [activity, setActivity] = useState(initial<AuditLogDocument[]>);
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
    void read(() => userRepository.getAll(), setUsers);
    void read(() => campusRepository.getAllCampuses(), setCampuses);
    void read(() => facilitatorStudentLinkRepository.getAll(), setLinks);
    void read(() => auditService.listRecent(6), setActivity);
    void read(async () => (await loadStatistics({ ...dashboardMonth(), campus: '', assessmentId: '', interval: 'monthly' }, { forceRefresh: revision > 0 })).totals.submissions, setSubmissions);
    return () => { cancelled = true; };
  }, [revision]);
  return { users, campuses, links, activity, submissions, refresh: () => setRevision(value => value + 1), loading: [users, campuses, links, activity, submissions].some(section => section.loading) };
}
