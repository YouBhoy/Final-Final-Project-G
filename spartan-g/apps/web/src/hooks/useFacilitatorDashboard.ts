import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { messagingService } from '@spartan-g/shared-services';
import { useAuth } from './useAuth';
import { useDashboardSections, type DashboardSection } from './useDashboardSections';
import { dashboardError, mapDashboardReads, scopeKey, SENSITIVE_DATA_MAX_AGE_MS, SUMMARY_FRESHNESS_MS, type DashboardScope } from '../lib/dashboardData';
import { dashboardCache, dashboardScope, readDashboardAppointments, watchDashboard } from '../lib/dashboardRuntime';
import { dashboardDate, loadDashboardNotifications } from '../lib/dashboardQueries';
import { getAssignedRiskAlerts } from '../lib/facilitatorAccess';
import { resolveStudentIdentity, studentAlias } from '../lib/studentIdentity';
import { manilaDay } from '../lib/dashboardMetrics';

export interface RiskSummary { high: number; medium: number; low: number }
export interface TodayAppointments { total: number; completed: number; requests: number }
export interface UpcomingAppointment { id: string; studentName: string; scheduledAt: Date }
export interface RecentConversation { id: string; participantId: string; participantName: string; lastMessage: string; unreadCount: number; updatedAt: Date | null }
type Messages = { recentConversations: RecentConversation[]; unreadTotal: number };
interface Sources {
  risk: RiskSummary;
  appointments: { todayAppointments: TodayAppointments; upcomingAppointments: UpcomingAppointment[] };
  notifications: Awaited<ReturnType<typeof loadDashboardNotifications>>;
}
export interface FacilitatorDashboardData {
  riskSummary: RiskSummary | null;
  todayAppointments: TodayAppointments | null;
  upcomingAppointments: UpcomingAppointment[] | null;
  recentConversations: RecentConversation[] | null;
  unreadTotal: number | null;
  notifications: Sources['notifications'] | null;
}
async function resolveName(scope: DashboardScope, uid: string) {
  try { return (await resolveStudentIdentity(scope.uid, uid, true))?.displayName || studentAlias(scope.uid, uid); }
  catch { return studentAlias(scope.uid, uid); }
}
export async function loadFacilitatorAppointments(scope: DashboardScope) {
  const rows = await readDashboardAppointments(scope);
  const today = manilaDay(new Date());
  const todaysList = rows.filter(row => { const date = dashboardDate(row.scheduledAt); return date && manilaDay(date) === today; });
  const upcoming = rows.flatMap(row => {
    const date = dashboardDate(row.scheduledAt);
    return row.status === 'accepted' && date && date.getTime() >= Date.now() ? [{ ...row, date }] : [];
  }).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 3);
  return {
    todayAppointments: { total: todaysList.length, completed: todaysList.filter(row => row.status === 'completed').length,
      requests: rows.filter(row => ['requested', 'reschedule_requested'].includes(row.status)).length },
    upcomingAppointments: await mapDashboardReads(upcoming, async row => ({ id: row.id, studentName: await resolveName(scope, row.studentId), scheduledAt: row.date })),
  };
}
export function useFacilitatorDashboard() {
  const { user } = useAuth();
  const scope = useMemo(() => user?.role === 'facilitator' ? dashboardScope(user.uid, user.role) : null, [user?.uid, user?.role]);
  const key = scope ? scopeKey(scope) : null;
  const current = useRef(key); current.current = key;
  const loaders = useMemo(() => ({
    risk: () => dashboardCache.read(scope!, 'risk', async () => {
      const rows = await getAssignedRiskAlerts(scope!.uid, true);
      return { high: rows.filter(row => ['high', 'critical'].includes(row.severity)).length,
        medium: rows.filter(row => row.severity === 'medium').length, low: rows.filter(row => row.severity === 'low').length };
    }, SUMMARY_FRESHNESS_MS, SENSITIVE_DATA_MAX_AGE_MS),
    appointments: () => loadFacilitatorAppointments(scope!),
    notifications: () => loadDashboardNotifications(scope!),
  }), [key]);
  const reads = useDashboardSections<Sources>(key, loaders);
  const [messages, setMessages] = useState<{ key: string | null; section: DashboardSection<Messages> } | null>(null);
  const [listenerRevision, setListenerRevision] = useState(0);
  const reload = useCallback(() => { if (scope) dashboardCache.invalidate(scope); reads.reload(); setListenerRevision(value => value + 1); }, [key, reads.reload]);
  useEffect(() => {
    if (!scope) return;
    try { return watchDashboard(scope, reads.reload, (section, cause) => reads.fail(section as keyof Sources, cause)); }
    catch (cause) { for (const section of Object.keys(loaders) as (keyof Sources)[]) reads.fail(section, cause); }
  }, [key, listenerRevision, reads.reload, reads.fail]);
  useEffect(() => {
    let active = true, sequence = 0;
    setMessages({ key, section: { data: null, loading: !!scope, error: null } });
    if (!scope) return;
    const fail = (cause: unknown) => { sequence++; if (active && current.current === key) setMessages({ key, section: { data: null, loading: false, error: dashboardError(cause) } }); };
    let stop: (() => void) | undefined;
    try {
      stop = messagingService.subscribeToConversations(scope.uid, scope.role, conversations => {
        const request = ++sequence;
        void mapDashboardReads(conversations.slice(0, 4), async row => {
          const other = row.participantIds.find(id => id !== scope.uid) ?? '';
          return { id: row.id, participantId: other, participantName: await resolveName(scope, other), lastMessage: row.lastMessagePreview || '', unreadCount: row.unreadCount?.[scope.uid] || 0, updatedAt: dashboardDate(row.lastMessageAt) };
        }).then(recentConversations => {
          if (!active || current.current !== key || request !== sequence) return;
          setMessages({ key, section: { loading: false, error: null, data: { recentConversations,
            unreadTotal: conversations.reduce((sum, row) => sum + (row.unreadCount?.[scope.uid] || 0), 0) } } });
        }, fail);
      }, fail);
    } catch (cause) { fail(cause); }
    return () => { active = false; sequence++; stop?.(); };
  }, [key, listenerRevision]);
  const messageSection = messages?.key === key ? messages.section : { data: null, loading: !!scope, error: null };
  const sections = { ...reads.sections, messages: messageSection };
  const data: FacilitatorDashboardData = { riskSummary: sections.risk.data, todayAppointments: sections.appointments.data?.todayAppointments ?? null,
    upcomingAppointments: sections.appointments.data?.upcomingAppointments ?? null, recentConversations: messageSection.data?.recentConversations ?? null,
    unreadTotal: messageSection.data?.unreadTotal ?? null, notifications: sections.notifications.data };
  return { data: scope ? data : null, sections, loading: reads.loading || messageSection.loading, error: reads.error ?? messageSection.error, reload };
}
