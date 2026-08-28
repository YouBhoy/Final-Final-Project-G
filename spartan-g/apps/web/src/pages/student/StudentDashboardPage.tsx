import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { appointmentService } from "@spartan-g/shared-services";
import { useStudentDashboard } from "../../hooks/useStudentDashboard";
import { Spinner } from "../../components/ui/Spinner";
import { notificationRoute, UiNotification } from "../../lib/notificationRouting";
import type { AppointmentDocument } from "@spartan-g/shared-types";

/**
 * Student Dashboard — a consolidated view of the student's wellbeing activity,
 * powered entirely by live data from the existing shared services:
 *   - appointments   (appointmentService)
 *   - assessments    (assessmentService — progress + resume)
 *   - messages       (messagingService — real-time unread counts)
 *   - notifications  (appointmentService / notifications)
 * No mock data or hardcoded document IDs.
 */

const APPOINTMENT_LABELS: Record<AppointmentDocument["status"], string> = {
  requested: "Requested",
  accepted: "Accepted",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  no_show: "No Show",
  reschedule_requested: "Reschedule Requested",
};

function formatDateTime(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "—";
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CircularProgress({ value }: { value: number }) {
  const size = 88;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-border-light)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-[var(--color-accent)] transition-all duration-700"
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-[var(--color-text)] text-[16px] font-bold font-[family-name:var(--font-body)]"
      >
        {Math.round(value)}%
      </text>
    </svg>
  );
}

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

export function StudentDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStudentDashboard();

  const studentName = user?.displayName?.split(" ")[0] ?? "Student";
  const total = data?.assessments.total ?? 0;
  const completed = data?.assessments.completed ?? 0;
  const percent = total > 0 ? (completed / total) * 100 : 0;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner label="Loading your dashboard…" />
      </div>
    );
  }

  const next = data?.appointments.next ?? null;
  const unreadMessages = data?.messages.unreadTotal ?? 0;
  const unreadNotifications = data?.notifications.unreadCount ?? 0;

  /** Click a notification → mark read → redirect to the relevant page. */
  const handleOpenNotification = (notification: UiNotification) => {
    if (!notification.isRead) {
      void appointmentService.markNotificationRead(notification.id).catch(() => undefined);
    }
    const route = notificationRoute(user?.role, notification);
    if (route) navigate(route);
  };

  return (
    <div className="space-y-8">
      {/* ─── Welcome Banner ─────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden rounded-[var(--radius-xl)] px-8 py-10 sm:px-12 sm:py-12"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)",
        }}
      >
        <div className="absolute left-0 top-0 h-full w-1 bg-[var(--color-accent)]" />
        <HeroPattern />
        <div className="relative max-w-2xl">
          <p className="text-sm font-medium tracking-wider text-[var(--color-accent)] uppercase">
            Welcome back, {studentName}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight text-white sm:text-3xl">
            Student Dashboard
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/90">
            &ldquo;Leading Innovations, Transforming Lives, Building the Nation.&rdquo;
          </p>
          <p className="mt-1 text-sm leading-relaxed text-white/70">
            Here&rsquo;s your latest wellbeing activity — appointments, assessments, and messages
            at a glance.
          </p>
        </div>
      </section>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-error)]/20 bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error)]">
          <span>Some dashboard data could not be loaded: {error}</span>
          <button
            onClick={reload}
            className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-error)]/30 px-3 py-1 text-xs font-medium hover:bg-[var(--color-error)]/10"
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── Stat Cards Row ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        {/* Next Appointment */}
        <div className="group rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-pastel)]">
              <svg className="h-6 w-6 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-label">Next Appointment</p>
              {next ? (
                <>
                  <p className="mt-0.5 font-[family-name:var(--font-heading)] text-base font-bold leading-snug text-[var(--color-text)]">
                    {formatDateTime(next.scheduledAt)}
                  </p>
                  <p className="type-caption mt-0.5 truncate">
                    {next.facilitatorName} &middot; {APPOINTMENT_LABELS[next.status]}
                  </p>
                </>
              ) : (
                <p className="pt-1 text-sm text-[var(--color-text-secondary)]">No upcoming</p>
              )}
            </div>
          </div>
        </div>

        {/* Unread Messages */}
        <div className="group rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-pastel)]">
              <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.753 9.753 0 01-3.555-.732A5.122 5.122 0 015.634 18 5.125 5.125 0 015.25 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-label">Unread Messages</p>
              <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">
                {unreadMessages}
              </p>
              <p className="type-caption mt-0.5">From your facilitators</p>
            </div>
          </div>
        </div>
        {/* Assessments Completed */}
        <div className="group rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-pastel)]">
              <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-label">Assessments</p>
              <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">
                {completed}/{total}
              </p>
              <p className="type-caption mt-0.5">{Math.max(0, total - completed)} remaining</p>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="group rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-pastel)]">
              <svg className="h-6 w-6 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-label">Notifications</p>
              <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">
                {unreadNotifications}
              </p>
              <p className="type-caption mt-0.5">unread alerts</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Assessment Progress + Upcoming Appointments ────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Assessment Progress */}
        <div className="lg:col-span-2 rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <CircularProgress value={percent} />
              <div>
                <h3 className="type-section">Assessment Progress</h3>
                <p className="type-body mt-1">Complete your assessments to track your wellbeing journey.</p>
                <p className="type-caption mt-2">
                  {data?.assessments.completed ?? 0} completed &middot;{" "}
                  {data?.assessments.inProgress ?? 0} in progress &middot;{" "}
                  {data?.assessments.notStarted ?? 0} not started
                </p>
              </div>
            </div>
            {data?.assessments.resumeAssessmentId ? (
              <button
                onClick={() => navigate(`/student/assessment/${data.assessments.resumeAssessmentId}`)}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-button transition-all duration-150 hover:-translate-y-0.5 hover:bg-[var(--color-primary-light)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                Continue Assessment
              </button>
            ) : (
              <button
                onClick={() => navigate("/student/assessments")}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-button transition-all duration-150 hover:-translate-y-0.5 hover:bg-[var(--color-primary-light)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                Browse Assessments
              </button>
            )}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="type-section">Upcoming Appointments</h3>
            <button
              onClick={() => navigate("/student/appointments")}
              className="text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              View all
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {(data?.appointments.upcoming ?? []).length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No upcoming appointments. Book one to get started.
              </p>
            ) : (
              (data?.appointments.upcoming ?? []).map((apt) => (
                <div
                  key={apt.id}
                  className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                      {apt.facilitatorName}
                    </p>
                    <p className="type-caption mt-0.5">{formatDateTime(apt.scheduledAt)}</p>
                  </div>
                  <span className="inline-flex shrink-0 rounded-md bg-[var(--color-primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/20">
                    {APPOINTMENT_LABELS[apt.status]}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ─── Recent Conversations + Notifications ──────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Conversations */}
        <div className="lg:col-span-2 rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="type-section">Recent Conversations</h3>
            <button
              onClick={() => navigate("/student/messages")}
              className="text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Open messages
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {(data?.messages.recent ?? []).length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No conversations yet. Messaging opens after an appointment is accepted.
              </p>
            ) : (
              (data?.messages.recent ?? []).map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() =>
                    navigate(`/student/messages?conversation=${encodeURIComponent(conversation.id)}`)
                  }
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-all duration-150 hover:bg-[var(--color-primary-pastel)]"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-sm font-semibold text-[var(--color-primary)]">
                    {conversation.id.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${conversation.unread > 0 ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-secondary)]"}`}>
                      {conversation.preview || "Conversation"}
                    </p>
                    {conversation.lastMessageAt && (
                      <p className="type-caption mt-0.5">{formatDateTime(conversation.lastMessageAt)}</p>
                    )}
                  </div>
                  {conversation.unread > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1.5 text-[10px] font-bold text-white">
                      {conversation.unread > 99 ? "99+" : conversation.unread}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="type-section">Notifications</h3>
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[11px] font-bold text-white">
              {unreadNotifications}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {(data?.notifications.recent ?? []).length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                You&rsquo;re all caught up.
              </p>
            ) : (
              (data?.notifications.recent ?? []).slice(0, 4).map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleOpenNotification(notification as UiNotification)}
                  className={`w-full rounded-[var(--radius-md)] bg-[var(--color-bg)] p-3 text-left transition-all duration-150 hover:bg-[var(--color-primary-pastel)] ${
                    !notification.isRead ? "border-l-2 border-[var(--color-accent)]" : ""
                  }`}
                >
                  <p className={`text-sm ${notification.isRead ? "text-[var(--color-text-secondary)]" : "font-semibold text-[var(--color-text)]"}`}>
                    {notification.title}
                  </p>
                  {notification.body && (
                    <p className="type-caption mt-0.5 line-clamp-2">{notification.body}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ─── Quick Actions ──────────────────────────────────────────────── */}
      <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
        <h3 className="type-section">Quick Actions</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            onClick={() => navigate("/student/facilitators")}
            className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] px-4 py-3 text-left text-sm font-medium text-[var(--color-text)] transition-all duration-150 hover:bg-[var(--color-primary-pastel)] hover:text-[var(--color-primary)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-pastel)] text-[var(--color-primary)]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </span>
            Find a Facilitator
          </button>
          <button
            onClick={() => navigate("/student/appointments")}
            className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] px-4 py-3 text-left text-sm font-medium text-[var(--color-text)] transition-all duration-150 hover:bg-[var(--color-accent-pastel)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-pastel)] text-[var(--color-accent)]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            Book Appointment
          </button>
          <button
            onClick={() => navigate("/student/assessments")}
            className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] px-4 py-3 text-left text-sm font-medium text-[var(--color-text)] transition-all duration-150 hover:bg-[var(--color-primary-pastel)] hover:text-[var(--color-primary)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-pastel)] text-[var(--color-primary)]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </span>
            Assessments
          </button>
          <button
            onClick={() => navigate("/student/messages")}
            className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] px-4 py-3 text-left text-sm font-medium text-[var(--color-text)] transition-all duration-150 hover:bg-[var(--color-primary-pastel)] hover:text-[var(--color-primary)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-pastel)] text-[var(--color-primary)]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            </span>
            Send Message
          </button>
        </div>
      </div>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--color-border-light)] pt-6">
        <p className="text-center type-caption">
          &copy; {new Date().getFullYear()} Batangas State University &middot; The National
          Engineering University
        </p>
      </footer>
    </div>
  );
}


