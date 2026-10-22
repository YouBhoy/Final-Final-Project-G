import { ALL_CAMPUSES, getCampusLabel, type CampusDocument, type FacilitatorStudentLinkDocument, type UserDocument } from '@spartan-g/shared-types';

export type DashboardUser = Pick<UserDocument, 'role' | 'campus' | 'isActive'> & { id: string };

/** Match campus management's built-in campuses, preserving persisted overrides. */
export function dashboardOverview(users: DashboardUser[], campuses: CampusDocument[], links: FacilitatorStudentLinkDocument[]) {
  const students = users.filter(user => user.role === 'student');
  const facilitators = users.filter(user => user.role === 'facilitator' && user.isActive === true);
  const available = new Set(facilitators.map(user => user.id));
  const connected = new Set(links.filter(link => link.status === 'accepted' && available.has(link.facilitatorId)).map(link => link.studentId));
  const unlinked = students.filter(user => user.isActive === true && !connected.has(user.id));
  const campusMap = new Map<string, { key: string; label: string; isActive: boolean }>(ALL_CAMPUSES.map(key => [key, { key, label: getCampusLabel(key), isActive: true }]));
  campuses.forEach(campus => campusMap.set(campus.key, campus));
  const campusRows = [...campusMap.values()].map(campus => ({
    ...campus,
    students: students.filter(user => user.campus === campus.key && user.isActive === true).length,
    facilitators: facilitators.filter(user => user.campus === campus.key).length,
  })).sort((a, b) => a.label.localeCompare(b.label));
  return { students, facilitators, unlinked, campuses: campusRows, uncovered: campusRows.filter(campus => campus.isActive && campus.facilitators === 0) };
}

/** Calendar month in the platform's reporting timezone, including the current day. */
export function dashboardMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return { startDate: `${part('year')}-${part('month')}-01`, endDate: `${part('year')}-${part('month')}-${part('day')}` };
}
