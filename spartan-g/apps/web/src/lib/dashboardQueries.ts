import { appointmentService, assessmentService, userService } from '@spartan-g/shared-services';
import type { AppointmentDocument } from '@spartan-g/shared-types';
import { getPublishedAssessmentDefinitions } from './assessmentDefinitions';
import { mapDashboardReads, SUMMARY_FRESHNESS_MS, type DashboardScope } from './dashboardData';
import { dashboardCache, readDashboardAppointments } from './dashboardRuntime';
import { studentAssessmentProgress } from './dashboardMetrics';

export function dashboardDate(value: unknown): Date | null {
  if (!value) return null;
  const raw = value as { toDate?: () => Date; seconds?: number };
  const date = value instanceof Date ? value : typeof raw.toDate === 'function' ? raw.toDate()
    : typeof raw.seconds === 'number' ? new Date(raw.seconds * 1000) : new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? date : null;
}
export interface AssessmentProgress {
  total: number; completed: number; inProgress: number; notStarted: number; submittedAttempts: number;
  progressDistribution: { completed: number; inProgress: number; activeRetakes: number; notStarted: number };
  progressTrend: { period: string; count: number }[];
  scores: { assessmentId: string; title: string; latest: number; average: number; submissions: number }[];
  resumeAssessmentId: string | null;
}
export async function loadAssessmentProgress(scope: DashboardScope): Promise<AssessmentProgress> {
  return dashboardCache.read(scope, 'assessments', async () => {
    const [published, submitted] = await Promise.all([
      dashboardCache.read(scope, 'catalog:published', getPublishedAssessmentDefinitions, SUMMARY_FRESHNESS_MS),
      assessmentService.getAttemptsByStudent(scope.uid),
    ]);
    const unique = [...new Map(published.map(item => [item.id, item])).values()];
    // Preserve catalogue order and the exact existing per-assessment/owner/limit(1) query.
    const attempts = await mapDashboardReads(unique, item => assessmentService.getInProgressAttempt(item.id, scope.uid));
    const active = unique.filter((_, index) => !!attempts[index]);
    const progress = studentAssessmentProgress(unique, submitted, active.map(item => item.id));
    return { ...progress, resumeAssessmentId: active[0]?.id ?? null };
  });
}
export interface StudentUpcomingAppointment {
  id: string; status: AppointmentDocument['status']; scheduledAt: Date;
  facilitatorId: string; facilitatorName: string; durationMinutes: number;
}
export async function loadStudentAppointments(scope: DashboardScope) {
  const rows = await readDashboardAppointments(scope);
  const upcoming = rows.flatMap(row => {
    const scheduledAt = dashboardDate(row.scheduledAt);
    return scheduledAt && scheduledAt.getTime() >= Date.now() && ['requested', 'accepted', 'reschedule_requested'].includes(row.status)
      ? [{ id: row.id, status: row.status, scheduledAt, facilitatorId: row.facilitatorId, durationMinutes: row.durationMinutes }] : [];
  }).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).slice(0, 5);
  const ids = [...new Set(upcoming.map(row => row.facilitatorId))];
  const names = await mapDashboardReads(ids, async id => {
    try { return (await userService.getUser(id))?.displayName || 'Facilitator'; }
    catch { return 'Facilitator'; }
  });
  const resolved: StudentUpcomingAppointment[] = upcoming.map(row => ({ ...row, facilitatorName: names[ids.indexOf(row.facilitatorId)] }));
  return { upcoming: resolved, next: resolved[0] ?? null };
}
export async function loadDashboardNotifications(scope: DashboardScope) {
  return dashboardCache.read(scope, 'notifications', async () => {
    const rows = await appointmentService.getAllNotifications(scope.uid);
    return { unreadCount: rows.filter(row => !row.isRead).length, recent: rows.slice(0, 5) };
  });
}
