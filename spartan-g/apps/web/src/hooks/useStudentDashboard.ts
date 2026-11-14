import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { messagingService } from '@spartan-g/shared-services';
import { useAuth } from './useAuth';
import { useDashboardSections, type DashboardSection } from './useDashboardSections';
import { dashboardError, scopeKey } from '../lib/dashboardData';
import { dashboardCache, dashboardScope, watchDashboard } from '../lib/dashboardRuntime';
import { dashboardDate, loadAssessmentProgress, loadDashboardNotifications, loadStudentAppointments } from '../lib/dashboardQueries';

export type { AssessmentProgress, StudentUpcomingAppointment as UpcomingAppointment } from '../lib/dashboardQueries';
export interface RecentConversation { id: string; preview: string; lastMessageAt: Date | null; unread: number }
interface Sources {
  appointments: Awaited<ReturnType<typeof loadStudentAppointments>>;
  assessments: Awaited<ReturnType<typeof loadAssessmentProgress>>;
  notifications: Awaited<ReturnType<typeof loadDashboardNotifications>>;
}
type Messages = { unreadTotal: number; recent: RecentConversation[] };
export interface StudentDashboardData {
  appointments: Sources['appointments'] | null;
  assessments: Sources['assessments'] | null;
  notifications: Sources['notifications'] | null;
  messages: Messages | null;
}
export function useStudentDashboard() {
  const { user } = useAuth();
  const scope = useMemo(() => user?.role === 'student' ? dashboardScope(user.uid, user.role) : null, [user?.uid, user?.role]);
  const key = scope ? scopeKey(scope) : null;
  const current = useRef(key); current.current = key;
  const loaders = useMemo(() => ({
    appointments: () => loadStudentAppointments(scope!),
    assessments: () => loadAssessmentProgress(scope!),
    notifications: () => loadDashboardNotifications(scope!),
  }), [key]);
  const reads = useDashboardSections<Sources>(key, loaders);
  const [messages, setMessages] = useState<{ key: string | null; section: DashboardSection<Messages> } | null>(null);
  const [listenerRevision, setListenerRevision] = useState(0);
  const reload = useCallback(() => {
    if (scope) dashboardCache.invalidate(scope);
    reads.reload(); setListenerRevision(value => value + 1);
  }, [key, reads.reload]);
  useEffect(() => {
    if (!scope) return;
    try { return watchDashboard(scope, reads.reload, (section, cause) => reads.fail(section as keyof Sources, cause)); }
    catch (cause) { for (const section of Object.keys(loaders) as (keyof Sources)[]) reads.fail(section, cause); }
  }, [key, listenerRevision, reads.reload, reads.fail]);
  useEffect(() => {
    let active = true;
    setMessages({ key, section: { data: null, loading: !!scope, error: null } });
    if (!scope) return;
    const fail = (cause: unknown) => { if (active && current.current === key) setMessages({ key, section: { data: null, loading: false, error: dashboardError(cause) } }); };
    let stop: (() => void) | undefined;
    try {
      stop = messagingService.subscribeToConversations(scope.uid, scope.role, conversations => {
        if (!active || current.current !== key) return;
        setMessages({ key, section: { loading: false, error: null, data: {
          unreadTotal: conversations.reduce((sum, row) => sum + (row.unreadCount?.[scope.uid] || 0), 0),
          recent: conversations.slice(0, 5).map(row => ({ id: row.id, preview: row.lastMessagePreview || '', lastMessageAt: dashboardDate(row.lastMessageAt), unread: row.unreadCount?.[scope.uid] || 0 })),
        } } });
      }, fail);
    } catch (cause) { fail(cause); }
    return () => { active = false; stop?.(); };
  }, [key, listenerRevision]);
  const messageSection = messages?.key === key ? messages.section : { data: null, loading: !!scope, error: null };
  const sections = { ...reads.sections, messages: messageSection };
  const data: StudentDashboardData = { appointments: sections.appointments.data, assessments: sections.assessments.data, notifications: sections.notifications.data, messages: sections.messages.data };
  return { data: scope ? data : null, sections, loading: reads.loading || messageSection.loading, error: reads.error ?? messageSection.error, reload };
}
