import { useEffect, useState, useCallback } from "react";
import {
  appointmentService,
  messagingService,
  userService,
  assessmentService,
} from "@spartan-g/shared-services";
import type {
  AppointmentDocument,
  AssessmentDefinitionDocument,
  NotificationDocument,
  Role,
} from "@spartan-g/shared-types";
import { useAuth } from "./useAuth";

/** A single upcoming appointment with the facilitator's display name resolved. */
export interface UpcomingAppointment {
  id: string;
  status: AppointmentDocument["status"];
  scheduledAt: Date;
  facilitatorId: string;
  facilitatorName: string;
  durationMinutes: number;
}

/** A recent conversation shown on the dashboard. */
export interface RecentConversation {
  id: string;
  preview: string;
  lastMessageAt: Date | null;
  unread: number;
}

/** Aggregated assessment progress for the current student. */
export interface AssessmentProgress {
  /** Number of published assessments currently available. */
  total: number;
  /** Distinct published assessments that have at least one submitted/graded attempt. */
  completed: number;
  /** Distinct published assessments with an in-progress attempt. */
  inProgress: number;
  /** total - completed - inProgress. */
  notStarted: number;
  /** ID of the first published assessment with an in-progress attempt (for resume). */
  resumeAssessmentId: string | null;
}

export interface StudentDashboardData {
  appointments: {
    upcoming: UpcomingAppointment[];
    next: UpcomingAppointment | null;
  };
  assessments: AssessmentProgress;
  messages: {
    unreadTotal: number;
    recent: RecentConversation[];
  };
  notifications: {
    unreadCount: number;
    recent: (NotificationDocument & { id: string })[];
  };
}

const EMPTY_DATA: StudentDashboardData = {
  appointments: { upcoming: [], next: null },
  assessments: { total: 0, completed: 0, inProgress: 0, notStarted: 0, resumeAssessmentId: null },
  messages: { unreadTotal: 0, recent: [] },
  notifications: { unreadCount: 0, recent: [] },
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof (value as any).toDate === "function") return (value as any).toDate() as Date;
  return new Date(value as any);
}

/**
 * Aggregates live data for the student dashboard from the existing shared services.
 * Only reads from collections already used by the feature pages:
 *  - appointments (appointmentService)
 *  - assessments + assessment_attempts (assessmentService)
 *  - conversations (messagingService — real-time subscription)
 *  - notifications (appointmentService)
 */
export function useStudentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const [appointmentsResult, assessmentsResult, notificationsResult] = await Promise.allSettled([
        loadAppointments(user.uid, role),
        loadAssessments(user.uid, role),
        loadNotifications(user.uid),
      ]);

      const appointments =
        appointmentsResult.status === "fulfilled"
          ? appointmentsResult.value
          : { upcoming: [], next: null };
      const assessments =
        assessmentsResult.status === "fulfilled"
          ? assessmentsResult.value
          : EMPTY_DATA.assessments;
      const notifications =
        notificationsResult.status === "fulfilled"
          ? notificationsResult.value
          : EMPTY_DATA.notifications;

      // Preserve messages set by the live subscription (do not clobber with empty).
      setData((prev) => ({
        appointments,
        assessments,
        messages: prev?.messages ?? EMPTY_DATA.messages,
        notifications,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Live message subscription (mirrors StudentMessagesPage / useConversationList).
  useEffect(() => {
    if (!user) return;
    const role = user.role as Role;

    const unsubscribe = messagingService.subscribeToConversations(
      user.uid,
      role,
      (conversations) => {
        setData((prev) => {
          const base = prev ?? EMPTY_DATA;
          const recent = conversations.slice(0, 5).map((c) => ({
            id: c.id,
            preview: c.lastMessagePreview || "",
            lastMessageAt: toDate(c.lastMessageAt),
            unread: c.unreadCount?.[user.uid] || 0,
          }));
          const unreadTotal = conversations.reduce(
            (sum, c) => sum + (c.unreadCount?.[user.uid] || 0),
            0,
          );
          return { ...base, messages: { unreadTotal, recent } };
        });
      },
      (listenerError) => {
        console.error("[useStudentDashboard] conversation listener error:", listenerError);
      },
    );

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

async function loadAppointments(
  userId: string,
  role: Role,
): Promise<{ upcoming: UpcomingAppointment[]; next: UpcomingAppointment | null }> {
  const appointments = await appointmentService.getStudentAppointments(userId, role);

  const active = appointments
    .filter((a) => a.status === "requested" || a.status === "accepted" || a.status === "reschedule_requested")
    .map((a) => ({
      id: a.id,
      status: a.status,
      scheduledAt: toDate(a.scheduledAt) ?? new Date(),
      facilitatorId: a.facilitatorId,
      facilitatorName: "Facilitator",
      durationMinutes: a.durationMinutes,
    }))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const upcoming = active.slice(0, 5);

  // Resolve facilitator display names (best-effort).
  const names = new Map<string, string>();
  for (const apt of upcoming) {
    if (names.has(apt.facilitatorId)) continue;
    try {
      const u = await userService.getUser(apt.facilitatorId);
      names.set(apt.facilitatorId, u?.displayName || "Facilitator");
    } catch {
      names.set(apt.facilitatorId, "Facilitator");
    }
  }
  const resolved = upcoming.map((apt) => ({
    ...apt,
    facilitatorName: names.get(apt.facilitatorId) ?? "Facilitator",
  }));

  return { upcoming: resolved, next: resolved[0] ?? null };
}

async function loadAssessments(userId: string, role: Role): Promise<AssessmentProgress> {
  // Published Phase 3B assessment definitions (same query as StudentAssessmentsPage).
  const { getDocs, query, orderBy, collection, where } = await import("firebase/firestore");
  const { getFirestoreDb } = await import(
    "@spartan-g/shared-services/src/firebase/firestore"
  );

  const db = getFirestoreDb();
  const snapshot = await getDocs(
    query(
      collection(db, "assessments"),
      where("isPublished", "==", true),
      orderBy("title", "asc"),
    ),
  );

  const published: (AssessmentDefinitionDocument & { id: string })[] = [];
  snapshot.forEach((doc) => {
    const d = doc.data();
    if (d.courseId && typeof d.courseId === "string") {
      published.push({ id: doc.id, ...d } as unknown as AssessmentDefinitionDocument & { id: string });
    }
  });

  const publishedIds = new Set(published.map((p) => p.id));

  // Distinct published assessments with a submitted/graded attempt.
  const submitted = await assessmentService.getAttemptsByStudent(userId);
  const submittedIds = new Set(submitted.map((a) => a.assessmentId));

  // Distinct published assessments with an in-progress attempt; capture first for resume.
  const inProgressIds = new Set<string>();
  let resumeAssessmentId: string | null = null;
  for (const p of published) {
    const attemptId = await assessmentService.getInProgressAttempt(p.id, userId);
    if (attemptId) {
      inProgressIds.add(p.id);
      if (!resumeAssessmentId) resumeAssessmentId = p.id;
    }
  }

  let completed = 0;
  for (const id of publishedIds) if (submittedIds.has(id)) completed++;
  let inProgress = 0;
  for (const id of publishedIds) if (inProgressIds.has(id)) inProgress++;

  const total = publishedIds.size;
  return {
    total,
    completed,
    inProgress,
    notStarted: Math.max(0, total - completed - inProgress),
    resumeAssessmentId,
  };
}

async function loadNotifications(
  userId: string,
): Promise<{ unreadCount: number; recent: (NotificationDocument & { id: string })[] }> {
  const notifications = await appointmentService.getAllNotifications(userId);
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  return { unreadCount, recent: notifications.slice(0, 5) };
}


