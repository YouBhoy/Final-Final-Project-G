import { useEffect, useState, useCallback, useRef } from "react";
import {
  riskAlertService,
  appointmentService,
  messagingService,
  userService,
} from "@spartan-g/shared-services";
import type { NotificationDocument, Role } from "@spartan-g/shared-types";
import { useAuth } from "./useAuth";

/** Open risk alerts aggregated by severity (critical folds into high). */
export interface RiskSummary {
  high: number;
  medium: number;
  low: number;
}

/** Today's appointment counters for this facilitator. */
export interface TodayAppointments {
  total: number;
  completed: number;
  requests: number;
}

/** An upcoming (accepted) appointment with the student's name resolved. */
export interface UpcomingAppointment {
  id: string;
  studentName: string;
  scheduledAt: Date;
}

/** A recent conversation with the other participant's name resolved. */
export interface RecentConversation {
  id: string;
  participantId: string;
  participantName: string;
  lastMessage: string;
  unreadCount: number;
  updatedAt: Date | null;
}

export interface FacilitatorDashboardData {
  riskSummary: RiskSummary;
  todayAppointments: TodayAppointments;
  upcomingAppointments: UpcomingAppointment[];
  recentConversations: RecentConversation[];
  unreadTotal: number;
  notifications: {
    unreadCount: number;
    recent: (NotificationDocument & { id: string })[];
  };
}

const EMPTY_DATA: FacilitatorDashboardData = {
  riskSummary: { high: 0, medium: 0, low: 0 },
  todayAppointments: { total: 0, completed: 0, requests: 0 },
  upcomingAppointments: [],
  recentConversations: [],
  unreadTotal: 0,
  notifications: { unreadCount: 0, recent: [] },
};

/**
 * Aggregates live data for the facilitator dashboard from the existing shared
 * services. No mock data, no hardcoded IDs:
 *  - risk alerts      (riskAlertService.getOpenAlerts)
 *  - appointments     (appointmentService.getAppointments / getUpcoming)
 *  - conversations    (messagingService — real-time subscription)
 *  - user names       (userService)
 */
export function useFacilitatorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<FacilitatorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nameCacheRef = useRef<Map<string, string>>(new Map());

  /** Resolve a participant's display name, cached to avoid repeat reads. */
  const resolveUserName = useCallback(async (uid: string): Promise<string> => {
    if (!uid) return "Unknown";
    const cached = nameCacheRef.current.get(uid);
    if (cached) return cached;
    try {
      const userDoc = await userService.getUser(uid);
      const name = userDoc?.displayName || "Student";
      nameCacheRef.current.set(uid, name);
      return name;
    } catch {
      return "Student";
    }
  }, []);

  const reload = useCallback(async () => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }

    const role = user.role as Role;

    try {
      setLoading(true);
      setError(null);

      const [riskResult, appointmentsResult, notificationsResult] = await Promise.allSettled([
        loadRiskSummary(user.uid, role),
        loadAppointments(user.uid, role, resolveUserName),
        loadNotifications(user.uid),
      ]);

      // Preserve live conversation data owned by the subscription.
      setData((prev) => ({
        riskSummary:
          riskResult.status === "fulfilled" ? riskResult.value : EMPTY_DATA.riskSummary,
        todayAppointments:
          appointmentsResult.status === "fulfilled"
            ? appointmentsResult.value.todayAppointments
            : EMPTY_DATA.todayAppointments,
        upcomingAppointments:
          appointmentsResult.status === "fulfilled"
            ? appointmentsResult.value.upcomingAppointments
            : EMPTY_DATA.upcomingAppointments,
        recentConversations: prev?.recentConversations ?? EMPTY_DATA.recentConversations,
        unreadTotal: prev?.unreadTotal ?? EMPTY_DATA.unreadTotal,
        notifications:
          notificationsResult.status === "fulfilled"
            ? notificationsResult.value
            : prev?.notifications ?? EMPTY_DATA.notifications,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [user, resolveUserName]);

  // Live message subscription — mirrors the student dashboard behaviour.
  useEffect(() => {
    if (!user) return;
    const role = user.role as Role;
    let isActive = true;

    const unsubscribe = messagingService.subscribeToConversations(
      user.uid,
      role,
      (conversations) => {
        void (async () => {
          const recent = await Promise.all(
            conversations.slice(0, 4).map(async (c) => {
              const otherId = c.participantIds.find((id) => id !== user.uid) ?? "";
              const participantName = await resolveUserName(otherId);
              return {
                id: c.id,
                participantId: otherId,
                participantName,
                lastMessage: c.lastMessagePreview || "",
                unreadCount: c.unreadCount?.[user.uid] || 0,
                updatedAt: toDate(c.lastMessageAt),
              } satisfies RecentConversation;
            }),
          );
          const unreadTotal = conversations.reduce(
            (sum, c) => sum + (c.unreadCount?.[user.uid] || 0),
            0,
          );
          if (!isActive) return;
          setData((prev) => ({
            ...(prev ?? EMPTY_DATA),
            recentConversations: recent,
            unreadTotal,
          }));
        })();
      },
      (listenerError) => {
        console.error("[useFacilitatorDashboard] conversation listener error:", listenerError);
      },
    );

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [user, resolveUserName]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

async function loadRiskSummary(facilitatorId: string, role: Role): Promise<RiskSummary> {
  const alerts = await riskAlertService.getOpenAlerts(facilitatorId, role);
  return {
    high: alerts.filter((a) => a.severity === "high" || a.severity === "critical").length,
    medium: alerts.filter((a) => a.severity === "medium").length,
    low: alerts.filter((a) => a.severity === "low").length,
  };
}

async function loadAppointments(
  facilitatorId: string,
  role: Role,
  resolveUserName: (uid: string) => Promise<string>,
): Promise<{ todayAppointments: TodayAppointments; upcomingAppointments: UpcomingAppointment[] }> {
  const [appointments, upcoming] = await Promise.all([
    appointmentService.getAppointments(facilitatorId, role),
    appointmentService.getUpcoming(facilitatorId, role),
  ]);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const todaysList = appointments.filter((apt) => {
    const d = toDate(apt.scheduledAt);
    return d !== null && d >= startOfDay && d < endOfDay;
  });

  const todayAppointments: TodayAppointments = {
    total: todaysList.length,
    completed: todaysList.filter((a) => a.status === "completed").length,
    requests: todaysList.filter((a) => a.status === "requested").length,
  };

  const upcomingAppointments = await Promise.all(
    upcoming.slice(0, 3).map(async (apt) => ({
      id: apt.id,
      studentName: await resolveUserName(apt.studentId),
      scheduledAt: toDate(apt.scheduledAt) ?? new Date(),
    })),
  );

  return { todayAppointments, upcomingAppointments };
}

async function loadNotifications(
  userId: string,
): Promise<{ unreadCount: number; recent: (NotificationDocument & { id: string })[] }> {
  const notifications = await appointmentService.getAllNotifications(userId);
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  return { unreadCount, recent: notifications.slice(0, 5) };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof (value as any).toDate === "function") return (value as any).toDate() as Date;
  return new Date(value as any);
}
