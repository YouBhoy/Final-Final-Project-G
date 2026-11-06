import type { AppointmentDocument, AssessmentAttemptDocument, WorkHoursScheduleDocument } from '@spartan-g/shared-types';
import { isSummaryRiskAvailable } from '@spartan-g/shared-services';
export function recordDate(value: unknown): Date | null {
  try { const v = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : value;
    const d = v instanceof Date ? v : typeof v === 'number' || typeof v === 'string' ? new Date(v) : null;
    return d && Number.isFinite(d.getTime()) ? d : null;
  } catch { return null; }
}
export function appointmentGroups<T extends AppointmentDocument>(rows: T[], now = new Date()) {
  const upcoming = rows.filter(a => a.status === 'accepted' && (recordDate(a.scheduledAt)?.getTime() ?? -Infinity) + a.durationMinutes * 60000 >= now.getTime()).sort((a,b) => (recordDate(a.scheduledAt)?.getTime() ?? 0) - (recordDate(b.scheduledAt)?.getTime() ?? 0));
  return { requests: rows.filter(a => a.status === 'requested'), upcoming, completed: rows.filter(a => a.status === 'completed'), history: rows.filter(a => a.status !== 'requested' && !upcoming.includes(a)) };
}
export function todaysAppointments<T extends AppointmentDocument>(rows: T[], now = new Date()) {
  return rows.filter(a => a.status === 'accepted' && recordDate(a.scheduledAt)?.toDateString() === now.toDateString()).sort((a,b) => recordDate(a.scheduledAt)!.getTime() - recordDate(b.scheduledAt)!.getTime());
}
/** Uses latest submitted/graded metadata per assessment, never derives clinical categories. */
export function historyActivity(attempts: (AssessmentAttemptDocument & {id: string})[]) {
  const submitted = attempts.filter(a => ['submitted','graded'].includes(a.status));
  const latest = new Map<string, typeof submitted[number]>(); let recentAt = 0;
  for (const a of submitted) { const time = recordDate(a.submittedAt)?.getTime() ?? 0; recentAt = Math.max(recentAt,time); const old = latest.get(a.assessmentId); if (!old || time > (recordDate(old.submittedAt)?.getTime() ?? 0)) latest.set(a.assessmentId,a); }
  const values = [...latest.values()], unknown = values.some(a => !isSummaryRiskAvailable(a));
  const flagged = values.some(a => isSummaryRiskAvailable(a) && ['high','critical'].includes(a.overallRiskLevel!));
  return { count: submitted.length, recentAt, attention: unknown ? null : flagged, riskUnavailable: unknown };
}
export function filterStudents<T extends {id: string; displayName: string; attention: boolean | null; recentAt: number}>(rows: T[], search: string, filter: 'All' | 'Needs Attention' | 'Recent', now = new Date()) {
  const start = new Date(now); start.setDate(start.getDate()-7);
  return rows.filter(s => s.displayName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (filter === 'All' || (filter === 'Needs Attention' ? s.attention === true : s.recentAt >= start.getTime() && s.recentAt <= now.getTime())));
}
export function hoursSummary(rows: WorkHoursScheduleDocument[]) {
  const minute = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? Number(t.slice(0,2))*60+Number(t.slice(3)) : NaN;
  const active = rows.filter(r => r.isActive), days = new Set(active.map(r => r.dayOfWeek));
  const valid = active.every(r => Number.isInteger(r.dayOfWeek) && r.dayOfWeek>=0 && r.dayOfWeek<=6 && minute(r.endTime)>minute(r.startTime)) && days.size === active.length;
  return { activeDays: days.size, hours: valid ? active.reduce((n,r)=>n+(minute(r.endTime)-minute(r.startTime))/60,0) : null };
}
