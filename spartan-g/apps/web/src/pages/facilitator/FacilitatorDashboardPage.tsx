import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { riskAlertService } from "@spartan-g/shared-services";
import { appointmentService } from "@spartan-g/shared-services";
import { messagingService } from "@spartan-g/shared-services";
import { assessmentService } from "@spartan-g/shared-services";
import { userService } from "@spartan-g/shared-services";

/**
 * Facilitator Dashboard - Daily workflow summary page
 * 
 * Architecture Notes:
 * - Uses existing services only (riskAlertService, appointmentService, messagingService, assessmentService)
 * - Does NOT modify shared-services, repositories, or shared-types
 * - Displays placeholder data with TODO comments where backend integration is pending
 * - Detailed risk information belongs exclusively in the Risk Alerts page
 */

interface DashboardStats {
  riskSummary: {
    high: number;
    medium: number;
    low: number;
  };
  todayAppointments: {
    total: number;
    completed: number;
    requests: number;
  };
  upcomingAppointments: Array<{
    id: string;
    studentName: string;
    scheduledAt: Date;
    time: string;
    date: string;
  }>;
  recentConversations: Array<{
    id: string;
    participantName: string;
    lastMessage: string;
    unreadCount: number;
    updatedAt: Date;
  }>;
}

export function FacilitatorDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    riskSummary: { high: 0, medium: 0, low: 0 },
    todayAppointments: { total: 0, completed: 0, requests: 0 },
    upcomingAppointments: [],
    recentConversations: [],
  });

  // Extract upcomingAppointments for easier access in JSX
  const upcomingAppointments = stats.upcomingAppointments;
  const [loading, setLoading] = useState(true);

  // TODO: Replace with actual facilitator ID from user context
  const facilitatorId = user?.uid || "facilitator_123";

  useEffect(() => {
    loadDashboardData();
  }, [facilitatorId]);

  async function loadDashboardData() {
    try {
      setLoading(true);

      // Fetch appointments for this facilitator
      const appointments = await appointmentService.getAppointments(facilitatorId, "facilitator" as any);
      
      // Fetch upcoming appointments
      const upcoming = await appointmentService.getUpcoming(facilitatorId, "facilitator" as any);

      // Process today's appointments
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayAppointmentsList = appointments.filter((apt: any) => {
        const aptDate = apt.scheduledAt?.toDate?.() || new Date(apt.scheduledAt);
        return aptDate >= today && aptDate < tomorrow;
      });

      const todayAppointments = {
        total: todayAppointmentsList.length,
        completed: todayAppointmentsList.filter((apt: any) => apt.status === 'completed').length,
        requests: todayAppointmentsList.filter((apt: any) => apt.status === 'requested').length,
      };

      // Process upcoming appointments (next 3) and fetch student names
      const upcomingAppointmentsList = upcoming.slice(0, 3);
      const upcomingAppointments = await Promise.all(
        upcomingAppointmentsList.map(async (apt: any) => {
          let studentName = "Student";
          try {
            const userDoc = await userService.getUser(apt.studentId);
            if (userDoc) studentName = userDoc.displayName || "Student";
          } catch (error) {
            console.error("Failed to fetch student name:", error);
          }

          const aptDate = apt.scheduledAt?.toDate?.() || new Date(apt.scheduledAt);
          
          return {
            id: apt.id,
            studentName,
            scheduledAt: aptDate,
            time: aptDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }).toUpperCase(),
            date: aptDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            }),
          };
        })
      );

      // Risk Summary - aggregate risk alerts by severity
      // TODO: Implement getRiskSummary() method in riskAlertService or compute from getOpenAlerts()
      const riskSummary = {
        high: 3,   // TODO: Replace with actual count from riskAlertService.getOpenAlerts()
        medium: 8, // TODO: Replace with actual count
        low: 21,   // TODO: Replace with actual count
      };

      // Recent Conversations
      // TODO: Implement getRecentConversations() in messagingService
      const recentConversations = [
        {
          id: "1",
          participantName: "Juan Dela Cruz",
          lastMessage: "Thank you for the appointment",
          unreadCount: 2,
          updatedAt: new Date(),
        },
        {
          id: "2",
          participantName: "Maria Santos",
          lastMessage: "Can we reschedule?",
          unreadCount: 1,
          updatedAt: new Date(),
        },
        {
          id: "3",
          participantName: "John Cruz",
          lastMessage: "See you tomorrow",
          unreadCount: 0,
          updatedAt: new Date(),
        },
      ];

      setStats({
        riskSummary,
        todayAppointments,
        upcomingAppointments,
        recentConversations,
      });
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

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
            Good Morning, {user?.displayName?.split(" ")[0] || "Dr. Smith"}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight text-white sm:text-3xl">
            Facilitator Dashboard
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/90">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Top Stats Row - Risk Summary & Today's Appointments */}
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
                  <p className="text-3xl font-bold text-red-600">{stats.riskSummary.high}</p>
                  <p className="mt-1 text-xs font-medium text-red-700">High Risk</p>
                </div>

                {/* Medium Risk */}
                <div className="rounded-[var(--radius-md)] bg-yellow-50 p-4 text-center">
                  <p className="text-3xl font-bold text-yellow-600">{stats.riskSummary.medium}</p>
                  <p className="mt-1 text-xs font-medium text-yellow-700">Medium Risk</p>
                </div>

                {/* Low Risk */}
                <div className="rounded-[var(--radius-md)] bg-green-50 p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{stats.riskSummary.low}</p>
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
                  <p className="text-3xl font-bold text-[var(--color-text)]">{stats.todayAppointments.total}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">Scheduled</p>
                </div>

                {/* Completed */}
                <div className="rounded-[var(--radius-md)] bg-green-50 p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{stats.todayAppointments.completed}</p>
                  <p className="mt-1 text-xs font-medium text-green-700">Completed</p>
                </div>

                {/* Requests */}
                <div className="rounded-[var(--radius-md)] bg-amber-50 p-4 text-center">
                  <p className="text-3xl font-bold text-amber-600">{stats.todayAppointments.requests}</p>
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
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-pastel)]">
                        <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--color-text)]">{appointment.studentName}</p>
                        <p className="type-caption">{appointment.date} • {appointment.time}</p>
                      </div>
                    </div>
                    <svg className="h-5 w-5 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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
                <p className="type-caption mt-1">Your latest conversations</p>
              </div>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-pastel)]">
                <svg className="h-5 w-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.753 9.753 0 01-3.555-.732A5.122 5.122 0 015.634 18 5.125 5.125 0 015.25 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {stats.recentConversations.length === 0 ? (
                <p className="type-caption text-center py-4">No recent messages</p>
              ) : (
                stats.recentConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-bg)] p-4 transition-all duration-150 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-pastel)]">
                        <svg className="h-5 w-5 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold text-sm ${conversation.unreadCount > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'}`}>
                            {conversation.participantName}
                          </p>
                          {conversation.unreadCount > 0 && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
                              {conversation.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className={`text-sm truncate ${conversation.unreadCount > 0 ? 'font-semibold text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'}`}>
                          {conversation.lastMessage}
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