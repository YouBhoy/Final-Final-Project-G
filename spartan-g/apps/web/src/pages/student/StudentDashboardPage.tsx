import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { appointmentService } from "@spartan-g/shared-services";
import { useStudentDashboard } from "../../hooks/useStudentDashboard";
import { Spinner } from "../../components/ui/Spinner";
import { notificationRoute, UiNotification } from "../../lib/notificationRouting";
import type { AppointmentDocument } from "@spartan-g/shared-types";

/**
 * Student Dashboard
 *
 * Live data only (appointments, assessments, messages, notifications) from
 * useStudentDashboard. No mock data or hardcoded document IDs.
 *
 * Design rules used here:
 *  - Red has jobs: the welcome banner is the single large red area; red is
 *    otherwise used for primary buttons, active states and small accents.
 *  - Everything else is white/neutral so the information stands out.
 *  - Type scale: page title 24-30, card titles 18, body 15, small 13.
 *  - Radius: 16 for the banner, 12 for cards, 8-10 for inner controls.
 *  - Spacing: 32 between sections, 24 between/inside cards, 16 within components.
 *
 * Layout:
 *   Banner -> 4 stat cards -> [Assessment progress | Quick actions]
 *          -> [Upcoming appointments | Recent activity] -> footer
 */

type AppointmentStatus = AppointmentDocument["status"];

const APPOINTMENT_LABELS: Record<AppointmentStatus, string> = {
  requested: "Requested",
  accepted: "Accepted",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  no_show: "No Show",
  reschedule_requested: "Reschedule Requested",
};

const STATUS_TONE: Record<AppointmentStatus, string> = {
  requested: "bg-[var(--color-accent-pastel)] text-[var(--color-text)]",
  reschedule_requested: "bg-[var(--color-accent-pastel)] text-[var(--color-text)]",
  accepted: "bg-[var(--color-primary-pastel)] text-[var(--color-primary)]",
  completed: "bg-[var(--color-primary-pastel)] text-[var(--color-primary)]",
  cancelled: "bg-[var(--color-error-bg)] text-[var(--color-error)]",
  rejected: "bg-[var(--color-error-bg)] text-[var(--color-error)]",
  no_show: "bg-[var(--color-error-bg)] text-[var(--color-error)]",
};

/* Shared class strings ---------------------------------------------------- */

const RED_SURFACE =
  "bg-[linear-gradient(135deg,var(--color-primary)_0%,var(--color-primary-dark)_100%)]";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]";
const FOCUS_INSET =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)]";

/** White card: 12px radius, 24px padding, thin border so it reads on the grey page. */
const CARD =
  "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-card";

/** Typography levels. */
const T_CARD_TITLE =
  "font-[family-name:var(--font-heading)] text-lg font-semibold leading-snug text-[var(--color-text)]";
const T_BODY = "text-[15px] leading-6 text-[var(--color-text)]";
const T_SMALL = "text-[13px] leading-5 text-[var(--color-text-secondary)]";

/** Buttons: hover = slightly darker, press = slightly smaller (skipped for reduced motion). */
const BTN_PRIMARY = `inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-button transition-[background-color,transform] duration-150 hover:bg-[var(--color-primary-dark)] motion-safe:active:scale-[0.98] ${FOCUS}`;
const LINK_BTN = `rounded-sm text-[13px] font-medium text-[var(--color-primary)] hover:underline ${FOCUS}`;

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const v = value as { toDate?: () => Date; seconds?: number };
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  const d = new Date(value as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isValidDate(value: Date | null | undefined): value is Date {
  return !!value && !Number.isNaN(value.getTime());
}

function formatDateTime(value: Date | null | undefined): string {
  if (!isValidDate(value)) return "—";
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatShortDate(value: Date | null | undefined): string {
  if (!isValidDate(value)) return "—";
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(value: Date | null | undefined): string {
  if (!isValidDate(value)) return "—";
  return value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "2:30 PM" today, "Yesterday", otherwise "Oct 7". */
function formatWhen(value: Date | null): string {
  if (!value) return "";
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(value)) / 86_400_000);
  if (days === 0) return formatTime(value);
  if (days === 1) return "Yesterday";
  return formatShortDate(value);
}

/* ─── Icons (heroicons outline paths) ─────────────────────────────────── */

const ICON = {
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  clock: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  calendar:
    "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  clipboard:
    "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z",
  chat: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  message:
    "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.753 9.753 0 01-3.555-.732A5.122 5.122 0 015.634 18 5.125 5.125 0 015.25 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
  bell: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  chevronRight: "M8.25 4.5l7.5 7.5-7.5 7.5",
} as const;

function Icon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

/* ─── Small building blocks ───────────────────────────────────────────── */

/** Subtle geometric pattern for the welcome banner. */
function HeroPattern() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.04]"
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sd-hero-mesh" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0.12" />
          <stop offset="50%" stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="white" stopOpacity="0.08" />
        </linearGradient>
        <pattern id="sd-hero-weave" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="32" height="32" fill="none" />
          <line x1="0" y1="0" x2="0" y2="32" stroke="white" strokeWidth="0.5" opacity="0.08" />
          <line x1="0" y1="0" x2="32" y2="0" stroke="white" strokeWidth="0.5" opacity="0.08" />
          <circle cx="16" cy="16" r="1" fill="white" opacity="0.12" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#sd-hero-mesh)" />
      <rect width="100%" height="100%" fill="url(#sd-hero-weave)" />
    </svg>
  );
}

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} ${label}`}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-[11px] font-bold text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUS_TONE[status]}`}
    >
      {APPOINTMENT_LABELS[status]}
    </span>
  );
}

/** Summary card: label + small icon on top, the number is the loudest thing. */
function StatCard({
  label,
  icon,
  value,
  caption,
}: {
  label: string;
  icon: string;
  value: string | number;
  caption: string;
}) {
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-pastel)] text-[var(--color-primary)]">
          <Icon path={icon} className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 truncate font-[family-name:var(--font-heading)] text-3xl font-bold leading-tight text-[var(--color-text)]">
        {value}
      </p>
      <p className={`${T_SMALL} mt-1 truncate`}>{caption}</p>
    </div>
  );
}

/** Intentional empty state: icon, what is missing, what to do about it. */
function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-2 py-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-pastel)] text-[var(--color-primary)]">
        <Icon path={icon} className="h-6 w-6" />
      </span>
      <p className={`${T_BODY} mt-3 font-semibold`}>{title}</p>
      <p className={`${T_SMALL} mt-1 max-w-xs`}>{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

interface ActivityItem {
  key: string;
  kind: "notification" | "message";
  title: string;
  detail: string;
  when: Date | null;
  unread: boolean;
  unreadCount: number;
  onOpen: () => void;
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export function StudentDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStudentDashboard();

  const studentName = user?.displayName?.split(" ")[0] ?? "Student";
  const total = data?.assessments.total ?? 0;
  const completed = data?.assessments.completed ?? 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner label="Loading your dashboard…" />
      </div>
    );
  }

  const next = data?.appointments.next ?? null;
  const upcoming = data?.appointments.upcoming ?? [];
  const unreadMessages = data?.messages.unreadTotal ?? 0;
  const unreadNotifications = data?.notifications.unreadCount ?? 0;
  const resumeId = data?.assessments.resumeAssessmentId ?? null;
  const remaining = Math.max(0, total - completed);

  /** Click a notification -> mark read -> redirect to the relevant page. */
  const handleOpenNotification = (notification: UiNotification) => {
    if (!notification.isRead) {
      void appointmentService.markNotificationRead(notification.id).catch(() => undefined);
    }
    const route = notificationRoute(user?.role, notification);
    if (route) navigate(route);
  };

  /** Recent activity = notifications + conversations, newest first. */
  const activity: ActivityItem[] = [
    ...(data?.notifications.recent ?? []).slice(0, 5).map((n): ActivityItem => {
      const ui = n as UiNotification;
      return {
        key: `n-${ui.id}`,
        kind: "notification",
        title: ui.title,
        detail: ui.body,
        when: toDate(ui.created_at),
        unread: !ui.isRead,
        unreadCount: 0,
        onOpen: () => handleOpenNotification(ui),
      };
    }),
    ...(data?.messages.recent ?? []).slice(0, 5).map(
      (c): ActivityItem => ({
        key: `m-${c.id}`,
        kind: "message",
        title: c.preview || "Conversation",
        detail: "",
        when: c.lastMessageAt,
        unread: c.unread > 0,
        unreadCount: c.unread,
        onOpen: () => navigate(`/student/messages?conversation=${encodeURIComponent(c.id)}`),
      }),
    ),
  ]
    .sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0))
    .slice(0, 6);

  const quickActions = [
    { label: "Find a Facilitator", icon: ICON.search, to: "/student/facilitators" },
    { label: "Book Appointment", icon: ICON.clock, to: "/student/appointments" },
    { label: "Take Assessment", icon: ICON.clipboard, to: "/student/assessments" },
    { label: "Send Message", icon: ICON.chat, to: "/student/messages" },
  ];

  return (
    <div className="space-y-8">
      {/* ─── Welcome banner (compact; the one big red area) ─────────────── */}
      <section
        aria-labelledby="sd-hero-heading"
        className={`relative overflow-hidden rounded-[var(--radius-xl)] px-6 py-5 sm:px-8 sm:py-6 ${RED_SURFACE}`}
      >
        <div className="absolute left-0 top-0 h-full w-1 bg-[var(--color-accent)]" />
        <HeroPattern />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white/95">Welcome back, {studentName}</p>
            <h1
              id="sd-hero-heading"
              className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight text-white sm:text-3xl"
            >
              Student Dashboard
            </h1>
            <p className="mt-1 text-sm text-white/90">
              Here&rsquo;s your latest wellbeing activity.
            </p>
          </div>
          <button
            onClick={() => navigate("/student/profile")}
            className="inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-white/50 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            View profile
          </button>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-error)]/20 bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error)]"
        >
          <span>Some dashboard data could not be loaded: {error}</span>
          <button
            onClick={reload}
            className={`shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-error)]/30 px-3 py-1 text-xs font-medium hover:bg-[var(--color-error)]/10 ${FOCUS}`}
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── Stat cards ─────────────────────────────────────────────────── */}
      <section aria-label="Summary" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Next appointment"
          icon={ICON.calendar}
          value={next ? formatShortDate(next.scheduledAt) : "None"}
          caption={
            next
              ? `${formatTime(next.scheduledAt)} with ${next.facilitatorName}`
              : "No upcoming appointment"
          }
        />
        <StatCard
          label="Unread messages"
          icon={ICON.message}
          value={unreadMessages}
          caption="From your facilitators"
        />
        <StatCard
          label="Assessments"
          icon={ICON.clipboard}
          value={`${completed}/${total}`}
          caption={total > 0 && remaining === 0 ? "All completed" : `${remaining} remaining`}
        />
        <StatCard
          label="Notifications"
          icon={ICON.bell}
          value={unreadNotifications}
          caption="unread alerts"
        />
      </section>

      {/* ─── Assessment progress + Quick actions ────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section aria-labelledby="sd-assess-heading" className={`${CARD} lg:col-span-2`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="sd-assess-heading" className={T_CARD_TITLE}>
                Assessment progress
              </h2>
              <p className={`${T_SMALL} mt-1`}>
                {total === 0
                  ? "No assessments are available yet."
                  : "Complete your assessments to track your wellbeing journey."}
              </p>
            </div>
            <p className="font-[family-name:var(--font-heading)] text-3xl font-bold leading-none text-[var(--color-text)]">
              {percent}%
            </p>
          </div>

          <div
            role="progressbar"
            aria-label="Assessments completed"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-5 h-3 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
          >
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className={T_SMALL}>
              {completed} completed &middot; {data?.assessments.inProgress ?? 0} in progress
              &middot; {data?.assessments.notStarted ?? 0} not started
            </p>
            <button
              onClick={() =>
                navigate(resumeId ? `/student/assessment/${resumeId}` : "/student/assessments")
              }
              className={BTN_PRIMARY}
            >
              {resumeId ? "Continue Assessment" : "View Assessments"}
            </button>
          </div>
        </section>

        <aside aria-labelledby="sd-actions-heading" className={CARD}>
          <h2 id="sd-actions-heading" className={T_CARD_TITLE}>
            Quick actions
          </h2>
          <ul className="-mx-2 mt-3 divide-y divide-[var(--color-border)]">
            {quickActions.map((action) => (
              <li key={action.label}>
                <button
                  onClick={() => navigate(action.to)}
                  className={`group flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-3 text-left transition-colors duration-150 hover:bg-[var(--color-primary-pastel)] ${FOCUS_INSET}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-pastel)] text-[var(--color-primary)]">
                    <Icon path={action.icon} />
                  </span>
                  <span className="flex-1 text-[15px] font-medium text-[var(--color-text)]">
                    {action.label}
                  </span>
                  <span className="text-[var(--color-text-secondary)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)] motion-reduce:transition-none">
                    <Icon path={ICON.chevronRight} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* ─── Upcoming appointments + Recent activity ────────────────────── */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section aria-labelledby="sd-upcoming-heading" className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="sd-upcoming-heading" className={T_CARD_TITLE}>
              Upcoming appointments
            </h2>
            {upcoming.length > 0 && (
              <button onClick={() => navigate("/student/appointments")} className={LINK_BTN}>
                View all
              </button>
            )}
          </div>

          {upcoming.length === 0 ? (
            <EmptyState
              icon={ICON.calendar}
              title="No upcoming appointments"
              text="You don't have any appointments scheduled yet."
              action={
                <button onClick={() => navigate("/student/appointments")} className={BTN_PRIMARY}>
                  Book an Appointment
                </button>
              }
            />
          ) : (
            <ul className="mt-4 space-y-3">
              {upcoming.map((apt) => (
                <li
                  key={apt.id}
                  className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-[var(--color-text)]">
                      {apt.facilitatorName}
                    </p>
                    <p className={`${T_SMALL} mt-0.5`}>{formatDateTime(apt.scheduledAt)}</p>
                  </div>
                  <StatusBadge status={apt.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="sd-activity-heading" className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="sd-activity-heading" className={T_CARD_TITLE}>
              Recent activity
            </h2>
            {activity.length > 0 && (
              <button onClick={() => navigate("/student/messages")} className={LINK_BTN}>
                Open messages
              </button>
            )}
          </div>

          {activity.length === 0 ? (
            <EmptyState
              icon={ICON.bell}
              title="No recent activity"
              text="Messages from facilitators and updates will show up here."
            />
          ) : (
            <ul className="-mx-2 mt-3 divide-y divide-[var(--color-border)]">
              {activity.map((item) => (
                <li key={item.key}>
                  <button
                    onClick={item.onOpen}
                    className={`flex w-full items-start gap-3 rounded-[var(--radius-md)] px-2 py-3 text-left transition-colors duration-150 hover:bg-[var(--color-primary-pastel)] ${FOCUS_INSET}`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-pastel)] text-[var(--color-primary)]">
                      <Icon path={item.kind === "message" ? ICON.chat : ICON.bell} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">{item.unread ? "Unread " : ""}</span>
                      <span
                        className={`block truncate text-[15px] ${
                          item.unread
                            ? "font-semibold text-[var(--color-text)]"
                            : "text-[var(--color-text-secondary)]"
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.detail && (
                        <span className={`${T_SMALL} line-clamp-1 block`}>{item.detail}</span>
                      )}
                      <span className={`${T_SMALL} block`}>
                        {item.kind === "message" ? "Message" : "Notification"}
                        {item.when ? ` · ${formatWhen(item.when)}` : ""}
                      </span>
                    </span>
                    {item.kind === "message" ? (
                      <CountBadge count={item.unreadCount} label="unread messages" />
                    ) : (
                      item.unread && (
                        <span
                          aria-hidden="true"
                          className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--color-primary)]"
                        />
                      )
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ─── Footer (kept quiet) ────────────────────────────────────────── */}
      <footer className="border-t border-[var(--color-border)] pt-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className={T_SMALL}>
            <span className="font-semibold text-[var(--color-primary)]">SPARTAN-G</span>
            {"  "}Student Wellbeing Portal
          </p>
          <p className={T_SMALL}>
            &copy; {new Date().getFullYear()} Batangas State University, The National Engineering
            University
          </p>
        </div>
        <p className={`${T_SMALL} mt-2`}>
          &ldquo;Leading Innovations, Transforming Lives, Building the Nation.&rdquo;
        </p>
      </footer>
    </div>
  );
}
