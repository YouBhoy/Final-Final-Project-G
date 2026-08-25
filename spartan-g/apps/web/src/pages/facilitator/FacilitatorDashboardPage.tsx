import { useAuth } from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useFacilitatorDashboard } from "../../hooks/useFacilitatorDashboard";

/**
 * Facilitator Dashboard — daily workflow summary, fully data-driven via
 * useFacilitatorDashboard:
 *   - risk summary     → riskAlertService.getOpenAlerts (real counts)
 *   - appointments     → appointmentService (today + upcoming, real names)
 *   - recent messages  → messagingService (real-time subscription)
 * No mock data, no hardcoded IDs.
 */

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

export function FacilitatorDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFacilitatorDashboard();

  const riskSummary = data?.riskSummary;
  const todayAppointments = data?.todayAppointments;
  const upcomingAppointments = data?.upcomingAppointments ?? [];
  const recentConversations = data?.recentConversations ?? [];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <section className="relative overflow-hidden rounded-[var(--radius-xl)] px-8 py-10 sm:px-12 sm:py-12"
        style={{
          background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)",
        }}
      >
        <div className="absolute left-0 top-0 h-full w-1 bg-[var(--color-accent)]" />
        <div className="relative max-w-2xl">
          <p className="text-sm font-medium tracking-wider text-[var(--color-accent)] uppercase">
            {getGreeting()}, {user?.displayName?.split(" ")[0] || "Facilitator"}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight text-white sm:text-3xl">
            Facilitator Dashboard
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/90">
            Support your students' wellbeing — here's today's caseload at a glance.
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

      {loading && !data ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Top Stats Row — Risk Summary & Today's Appointments */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* Risk Summary Card */}
            <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="type-section">Risk Summary</h3>
                  <p className="type-caption mt-1">Students requiring attention</p>
                </div>
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-pastel)]">
                  <svg className="h-5 w-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4">
                {/* High Risk */}
                <div className="rounded-[var(--radius-md)] bg-red-50 p-4 text-center">
                  <p className="text-3xl font-bold text-red-600">{riskSummary?.high ?? 0}</p>
                  <p className="mt-1 text-xs font-medium text-red-700">High Risk</p>
                </div>

                {/* Medium Risk */}
                <div className="rounded-[var(--radius-md)] bg-yellow-50 p-4 text-center">
                  <p className="text-3xl font-bold text-yellow-600">{riskSummary?.medium ?? 0}</p>
                  <p className="mt-1 text-xs font-medium text-yellow-700">Medium Risk</p>
                </div>

                {/* Low Risk */}
                <div className="rounded-[var(--radius-md)] bg-green-50 p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{riskSummary?.low ?? 0}</p>
                  <p className="mt-1 text-xs font-medium text-green-700">Low Risk</p>
                </div>
              </div>

              <button
                onClick={() => navigate("/facilitator/risk-alerts")}
                className="mt-4 w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-button transition-all duration-150 hover:bg-[var(--color-primary-light)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                View Risk Alerts
              </button>
            </div>

            {/* Today's Appointments Card */}
            <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="type-section">Today's Appointments</h3>
                  <p className="type-caption mt-1">Your schedule for today</p>
                </div>
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-pastel)]">
                  <svg className="h-5 w-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4">
                {/* Total Scheduled */}
                <div className="rounded-[var(--radius-md)] bg-[var(--color-bg)] p-4 text-center">
                  <p className="text-3xl font-bold text-[var(--color-text)]">{todayAppointments?.total ?? 0}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">Scheduled</p>
                </div>

                {/* Completed */}
                <div className="rounded-[var(--radius-md)] bg-green-50 p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{todayAppointments?.completed ?? 0}</p>
                  <p className="mt-1 text-xs font-medium text-green-700">Completed</p>
                </div>

                {/* Requests */}
                <div className="rounded-[var(--radius-md)] bg-amber-50 p-4 text-center">
                  <p className="text-3xl font-bold text-amber-600">{todayAppointments?.requests ?? 0}</p>
                  <p className="mt-1 text-xs font-medium text-amber-700">Requests</p>
                </div>
              </div>

              <button
                onClick={() => navigate("/facilitator/appointments")}
                className="mt-4 w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-button transition-all duration-150 hover:bg-[var(--color-primary-light)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                View All Appointments
              </button>
            </div>
          </div>


          {/* Upcoming Appointments Card */}
          <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="type-section">Upcoming Appointments</h3>
                <p className="type-caption mt-1">Your next few sessions</p>
              </div>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-pastel)]">
                <svg className="h-5 w-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {upcomingAppointments.length === 0 ? (
                <p className="type-caption text-center py-4">No upcoming appointments</p>
              ) : (
                upcomingAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-bg)] p-4 transition-all duration-150 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-pastel)]">
                        <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-[var(--color-text)] truncate">
                          {appointment.studentName}
                        </p>
                        <p className="type-caption mt-0.5">
                          {appointment.scheduledAt.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                          &middot;{" "}
                          {appointment.scheduledAt.toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <svg className="h-5 w-5 flex-shrink-0 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => navigate("/facilitator/appointments")}
              className="mt-4 w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-button transition-all duration-150 hover:bg-[var(--color-primary-light)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              View All Appointments
            </button>
          </div>


          {/* Recent Conversations Card */}
          <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="type-section">Recent Messages</h3>
                <p className="type-caption mt-1">
                  Your latest conversations
                  {data && data.unreadTotal > 0 ? ` — ${data.unreadTotal} unread` : ""}
                </p>
              </div>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-pastel)]">
                <svg className="h-5 w-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.753 9.753 0 01-3.555-.732A5.122 5.122 0 015.634 18 5.125 5.125 0 015.25 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {recentConversations.length === 0 ? (
                <p className="type-caption text-center py-4">No recent messages</p>
              ) : (
                recentConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() =>
                      navigate(
                        `/facilitator/messages?conversation=${encodeURIComponent(conversation.id)}`,
                      )
                    }
                    className="flex w-full items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-bg)] p-4 text-left transition-all duration-150 hover:bg-[var(--color-primary-pastel)] hover:shadow-sm"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-pastel)]">
                        <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm ${conversation.unreadCount > 0 ? "text-[var(--color-text)]" : "text-[var(--color-text-secondary)]"}`}>
                            {conversation.participantName}
                          </p>
                          {conversation.unreadCount > 0 && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
                              {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="type-caption mt-0.5 truncate">
                          {conversation.lastMessage || "No messages yet"}
                        </p>
                      </div>
                    </div>
                    <svg className="h-5 w-5 flex-shrink-0 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => navigate("/facilitator/messages")}
              className="mt-4 w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-button transition-all duration-150 hover:bg-[var(--color-primary-light)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Open Messages
            </button>
          </div>


          {/* Quick Actions Section */}
          <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
            <h3 className="type-section">Quick Actions</h3>
            <p className="type-caption mt-1">Common tasks and shortcuts</p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Schedule Appointment */}
              <button
                onClick={() => navigate("/facilitator/appointments")}
                className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] p-4 text-center transition-all duration-150 hover:bg-[var(--color-primary-pastel)] hover:shadow-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-pastel)]">
                  <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-[var(--color-text)]">Schedule Appointment</span>
              </button>

              {/* Open Student Directory */}
              <button
                onClick={() => navigate("/facilitator/students")}
                className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] p-4 text-center transition-all duration-150 hover:bg-[var(--color-primary-pastel)] hover:shadow-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-pastel)]">
                  <svg className="h-6 w-6 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-3.4-3.4 9.337 9.337 0 00-4.121.952 48.774 48.774 0 00-3.066 1.632c-.68.444-1.56.444-2.24 0a48.774 48.774 0 00-3.066-1.632 9.337 9.337 0 00-.952-4.121 48.774 48.774 0 00-1.632-3.066z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-[var(--color-text)]">Student Directory</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

