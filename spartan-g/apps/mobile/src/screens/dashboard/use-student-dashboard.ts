import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { assessmentService, appointmentRepository, messagingService, notificationRepository, userService, useAuthStore } from '@spartan-g/shared-services';
import type { AuthSession } from '@spartan-g/shared-types';
import { assessmentJourney, nextStudentAppointment, studentUnreadMessages } from './dashboard-model';

type Journey = ReturnType<typeof assessmentJourney>;
interface DashboardData {
  owner: AuthSession | null;
  journey: Journey | null;
  appointment: string | null;
  messages: number | null;
  name: string | null;
  avatar: string | null;
  errors: string[];
  loading: boolean;
}
const empty = (): DashboardData => ({ owner: null, journey: null, appointment: null, messages: null, name: null, avatar: null, errors: [], loading: true });

/** Read-only presentation adapter. Existing repositories retain all Auth/Rules
 * enforcement. Results are also bound to this exact session and focus lifetime. */
export function useStudentDashboard() {
  const session = useAuthStore(state => state.session);
  const status = useAuthStore(state => state.status);
  const authorized = status === 'authenticated' && session?.role === 'student';
  const [data, setData] = useState<DashboardData>(empty);
  const [bell, setBell] = useState<{ owner: AuthSession; unread: number } | null>(null);
  const request = useRef(0);
  const alive = useRef(false);
  const current = useCallback(() => authorized && useAuthStore.getState().status === 'authenticated' && useAuthStore.getState().session === session, [authorized, session]);

  const reload = useCallback(async () => {
    if (!session || !alive.current || !current()) return;
    const run = ++request.current;
    setData(previous => previous.owner === session ? { ...previous, loading: true, errors: [] } : { ...empty(), owner: session });
    const [assessments, appointments, messages, user, profile] = await Promise.allSettled([
      Promise.all([assessmentService.getAttemptsByStudent(session.uid), assessmentService.getInProgressAttemptsByStudent(session.uid)]),
      appointmentRepository.getByStudent(session.uid),
      messagingService.getConversations(session.uid, 'student'),
      userService.getUser(session.uid),
      userService.getProfile(session.uid),
    ]);
    if (!alive.current || request.current !== run || !current()) return;
    const errors: string[] = [];
    const journey = assessments.status === 'fulfilled' ? assessmentJourney(session.uid, ...assessments.value) : null;
    if (!journey) errors.push('Assessment progress is unavailable.');
    if (appointments.status === 'rejected') errors.push('Appointments are unavailable.');
    if (messages.status === 'rejected') errors.push('Message counts are unavailable.');
    const ownUser = user.status === 'fulfilled' && user.value?.uid === session.uid && user.value.role === 'student' ? user.value : null;
    const ownProfile = profile.status === 'fulfilled' && profile.value?.uid === session.uid ? profile.value : null;
    if (user.status === 'rejected' || profile.status === 'rejected') errors.push('Some profile details could not be loaded.');
    const avatar = ownUser?.photoURL || ownProfile?.avatarUrl;
    setData({ owner: session, journey, appointment: appointments.status === 'fulfilled' ? nextStudentAppointment(session.uid, appointments.value) : null,
      messages: messages.status === 'fulfilled' ? studentUnreadMessages(session.uid, messages.value) : null,
      name: ownUser?.displayName || session.displayName, avatar: typeof avatar === 'string' && avatar.startsWith('https://') ? avatar : null, errors, loading: false });
  }, [session, current]);

  // One load per focus. No mount+focus double fetch, interval or write side effects.
  useFocusEffect(useCallback(() => {
    alive.current = true;
    void reload();
    let stop: (() => void) | undefined;
    if (session && current()) stop = notificationRepository.subscribeByUserId(session.uid, rows => {
      if (alive.current && current()) setBell({ owner: session, unread: rows.filter(row => row.userId === session.uid && !row.isRead).length });
    });
    return () => { alive.current = false; request.current++; stop?.(); };
  }, [reload, current, session]));

  const visible = authorized && data.owner === session ? data : empty();
  return { ...visible, session, authorized, unreadNotifications: authorized && bell?.owner === session ? bell.unread : 0, reload, current };
}
