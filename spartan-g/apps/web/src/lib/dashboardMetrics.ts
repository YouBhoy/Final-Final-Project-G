import type { DashboardScope } from './dashboardData';

type Owned = { studentId?: string; facilitatorId?: string };
type Appointment = Owned & { status: string; scheduledAt?: unknown; durationMinutes?: number };
type Attempt = { studentId: string; assessmentId: string; status: string };
/** Selectors consume already-authorized query results; they never fetch or grant access.
 * Staff identity/consent checks must remain at the source. No message/answer text is needed.
 */
function visible<T extends Owned>(scope: DashboardScope, rows: readonly T[]): T[] {
  if (scope.role === 'super_admin') return [...rows];
  return rows.filter(row => scope.role === 'student' ? row.studentId === scope.uid : row.facilitatorId === scope.uid);
}
function dateOf(value: unknown): Date | null {
  const raw = value as { toDate?: () => Date; seconds?: number } | null;
  const date = value instanceof Date ? value : typeof raw?.toDate === 'function' ? raw.toDate()
    : typeof raw?.seconds === 'number' ? new Date(raw.seconds * 1000) : new Date(value as string | number);
  return value && Number.isFinite(date.getTime()) ? date : null;
}
export function manilaDay(date: Date): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const statuses = ['requested', 'accepted', 'reschedule_requested', 'completed', 'cancelled', 'rejected', 'no_show'] as const;
export function appointmentStatusCounts(scope: DashboardScope, rows: readonly Appointment[]) {
  const counts = Object.fromEntries([...statuses, 'unknown'].map(status => [status, 0])) as Record<typeof statuses[number] | 'unknown', number>;
  for (const row of visible(scope, rows)) counts[statuses.includes(row.status as typeof statuses[number]) ? row.status as typeof statuses[number] : 'unknown']++;
  return counts;
}
/** Scheduled dates, not creation dates. Missing/invalid dates are explicitly excluded. */
export function appointmentTrends(scope: DashboardScope, rows: readonly Appointment[], interval: 'day' | 'week' | 'month' = 'day') {
  const counts = new Map<string, number>();
  let unknownDate = 0;
  for (const row of visible(scope, rows)) {
    const date = dateOf(row.scheduledAt);
    if (!date) { unknownDate++; continue; }
    let period = manilaDay(date);
    if (interval === 'month') period = period.slice(0, 7);
    if (interval === 'week') {
      const day = new Date(`${period}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
      period = day.toISOString().slice(0, 10); // Monday in Manila.
    }
    counts.set(period, (counts.get(period) ?? 0) + 1);
  }
  return { periods: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count })), unknownDate };
}
export function facilitatorWorkload(scope: DashboardScope, rows: readonly Appointment[]) {
  // Students cannot enumerate facilitator workloads from their partial records.
  if (scope.role === 'student') return null;
  const result = new Map<string, { appointments: number; scheduledMinutes: number; unknownDuration: number }>();
  for (const row of visible(scope, rows)) {
    if (!row.facilitatorId || !['requested', 'accepted', 'reschedule_requested', 'completed'].includes(row.status)) continue;
    const metric = result.get(row.facilitatorId) ?? { appointments: 0, scheduledMinutes: 0, unknownDuration: 0 };
    metric.appointments++;
    if (Number.isFinite(row.durationMinutes) && row.durationMinutes! > 0) metric.scheduledMinutes += row.durationMinutes!;
    else metric.unknownDuration++;
    result.set(row.facilitatorId, metric);
  }
  return [...result].sort(([a], [b]) => a.localeCompare(b)).map(([facilitatorId, metric]) => ({ facilitatorId, ...metric }));
}
export function acceptedRelationshipCount(scope: DashboardScope, rows: readonly (Owned & { status: string })[]) {
  return new Set(visible(scope, rows).filter(row => row.status === 'accepted' && row.studentId && row.facilitatorId)
    .map(row => JSON.stringify([row.facilitatorId, row.studentId]))).size;
}
export function assessmentParticipation(scope: DashboardScope, rows: readonly Attempt[], permittedStudentIds: readonly string[] = []) {
  const allowed = new Set(scope.role === 'student' ? [scope.uid] : permittedStudentIds);
  const selected = rows.filter(row => scope.role === 'super_admin' || allowed.has(row.studentId));
  return { students: new Set(selected.map(row => row.studentId)).size,
    submitted: selected.filter(row => ['submitted', 'graded'].includes(row.status)).length,
    inProgress: selected.filter(row => row.status === 'in_progress').length,
    assessments: new Set(selected.map(row => row.assessmentId)).size };
}
/** Counts existing authorized alerts only; never rescales answers or makes diagnoses. */
export function screeningSeverityCounts(scope: DashboardScope, rows: readonly (Owned & { severity: string })[]) {
  if (scope.role === 'student') return null;
  const counts = { high: 0, medium: 0, low: 0, unknown: 0 };
  for (const row of visible(scope, rows)) {
    if (row.severity === 'critical' || row.severity === 'high') counts.high++;
    else if (row.severity === 'medium' || row.severity === 'low') counts[row.severity]++;
    else counts.unknown++;
  }
  return counts;
}
