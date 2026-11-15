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

export interface AssessmentMetricDefinition { id: string; title: string }
export interface AssessmentMetricAttempt { assessmentId: string; status: string; submittedAt?: unknown; score?: unknown }

/** Aggregates only submitted records for the caller-supplied authorized student set. */
export function facilitatorAssessmentParticipation(
  studentIds: readonly string[],
  publishedAssessmentIds: readonly string[],
  rows: readonly (AssessmentMetricAttempt & { studentId: string })[],
) {
  const permitted = [...new Set(studentIds)];
  const allowed = new Set(permitted);
  const published = new Set(publishedAssessmentIds);
  const completed = new Map(permitted.map(id => [id, new Set<string>()]));
  const attempts = new Map(permitted.map(id => [id, 0]));
  for (const row of rows) {
    if (!allowed.has(row.studentId) || !['submitted', 'graded'].includes(row.status)) continue;
    attempts.set(row.studentId, (attempts.get(row.studentId) ?? 0) + 1);
    if (published.has(row.assessmentId)) completed.get(row.studentId)!.add(row.assessmentId);
  }
  const students = permitted.map(studentId => ({
    studentId,
    completedAssessments: completed.get(studentId)!.size,
    submittedAttempts: attempts.get(studentId) ?? 0,
  }));
  return {
    submittedAttempts: students.reduce((sum, row) => sum + row.submittedAttempts, 0),
    studentsWithSubmissions: students.filter(row => row.completedAssessments > 0).length,
    students,
  };
}

/** Summarizes one student's own published assessment catalog and submitted attempts. */
export function studentAssessmentProgress(
  definitions: readonly AssessmentMetricDefinition[],
  attempts: readonly AssessmentMetricAttempt[],
  inProgressAssessmentIds: readonly string[],
  now = new Date(),
) {
  const catalogue = [...new Map(definitions.map(row => [row.id, row])).values()];
  const definitionIds = new Set(catalogue.map(row => row.id));
  const submitted = attempts.filter(row => ['submitted', 'graded'].includes(row.status));
  const completedIds = new Set(submitted.filter(row => definitionIds.has(row.assessmentId)).map(row => row.assessmentId));
  const activeIds = new Set(inProgressAssessmentIds.filter(id => definitionIds.has(id)));
  const completed = catalogue.filter(row => completedIds.has(row.id)).length;
  const inProgress = catalogue.filter(row => activeIds.has(row.id)).length;
  const activeRetakes = catalogue.filter(row => completedIds.has(row.id) && activeIds.has(row.id)).length;
  const notStarted = catalogue.filter(row => !completedIds.has(row.id) && !activeIds.has(row.id)).length;
  const progressDistribution = {
    completed: completed - activeRetakes,
    inProgress: inProgress - activeRetakes,
    activeRetakes,
    notStarted,
  };

  const currentMonth = manilaDay(now).slice(0, 7);
  const [year, month] = currentMonth.split('-').map(Number);
  const periods = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1));
    return date.toISOString().slice(0, 7);
  });
  const trendCounts = new Map(periods.map(period => [period, 0]));
  for (const row of submitted) {
    const date = dateOf(row.submittedAt);
    if (!date) continue;
    const period = manilaDay(date).slice(0, 7);
    if (trendCounts.has(period)) trendCounts.set(period, trendCounts.get(period)! + 1);
  }

  const scoreRows = new Map<string, { score: number; date: number }[]>();
  for (const row of submitted.filter(attempt => attempt.status === 'graded')) {
    if (!definitionIds.has(row.assessmentId) || typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > 100) continue;
    const values = scoreRows.get(row.assessmentId) ?? [];
    values.push({ score: row.score, date: dateOf(row.submittedAt)?.getTime() ?? 0 });
    scoreRows.set(row.assessmentId, values);
  }
  const scores = catalogue.flatMap(definition => {
    const values = scoreRows.get(definition.id);
    if (!values?.length) return [];
    values.sort((a, b) => a.date - b.date);
    return [{ assessmentId: definition.id, title: definition.title, latest: values[values.length - 1].score,
      average: values.reduce((sum, value) => sum + value.score, 0) / values.length, submissions: values.length }];
  });

  return {
    total: catalogue.length, completed, inProgress, notStarted, progressDistribution,
    submittedAttempts: submitted.length,
    progressTrend: periods.map(period => ({ period, count: trendCounts.get(period) ?? 0 })),
    scores,
  };
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
