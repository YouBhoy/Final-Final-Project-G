import { useAuth } from "../hooks/useAuth";
import { ROLE_LABELS } from "@spartan-g/shared-types";
import { useNavigate } from "react-router-dom";

interface DashboardPageProps {
  title: string;
  portalName: string;
}

/**
 * Static mock data for dashboard stats — styled presentation only.
 * In production, these would come from backend services.
 */
const MOCK_DATA = {
  assessmentsCompleted: 3,
  inProgress: 2,
  notStarted: 3,
  totalAssessments: 8,
  nextAppointment: "March 15, 2026 · 10:00 AM",
  nextCheckIn: "Tomorrow · 8:00 AM",
  unreadMessages: 4,
};

function CircularProgress({ value, size = 88, strokeWidth = 6 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border-light)" strokeWidth={strokeWidth} />
      {/* Progress ring — gold fill */}
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="text-[var(--color-accent)] transition-all duration-700" />
      {/* Center text */}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-[var(--color-text)] text-[16px] font-bold font-[family-name:var(--font-body)]">
        {Math.round(value)}%
      </text>
    </svg>
  );
}

/* ─── Subtle abstract diagonal weave (banner background) ── */
function HeroPattern() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.04]" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        {/* Diagonal gradient mesh */}
        <linearGradient id="hero-mesh" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0.12" />
          <stop offset="50%" stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="white" stopOpacity="0.08" />
        </linearGradient>
        {/* Fine diagonal weave pattern */}
        <pattern id="hero-weave" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="32" height="32" fill="none" />
          <line x1="0" y1="0" x2="0" y2="32" stroke="white" strokeWidth="0.5" opacity="0.08" />
          <line x1="0" y1="0" x2="32" y2="0" stroke="white" strokeWidth="0.5" opacity="0.08" />
          <circle cx="16" cy="16" r="1" fill="white" opacity="0.12" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hero-mesh)" />
      <rect width="100%" height="100%" fill="url(#hero-weave)" />
    </svg>
  );
}

export function DashboardPage({ title, portalName }: DashboardPageProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const assessmentPercent = Math.round((MOCK_DATA.assessmentsCompleted / MOCK_DATA.totalAssessments) * 100);
  const studentName = user?.displayName?.split(" ")[0] ?? "Student";

  return (
    <div className="space-y-8">
      {/* ─── Welcome Banner ──────────────────────────────────────────── */}
      {/* Fix #4: Geometric pattern + increased vertical padding */}
      <section
        className="relative overflow-hidden rounded-[var(--radius-xl)] px-8 py-10 sm:px-12 sm:py-12"
        style={{
          background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)",
        }}
      >
        {/* Gold accent bar */}
        <div className="absolute left-0 top-0 h-full w-1 bg-[var(--color-accent)]" />

        {/* Geometric pattern instead of washed-out watermark */}
        <HeroPattern />

        <div className="relative max-w-2xl">
          <p className="text-sm font-medium tracking-wider text-[var(--color-accent)] uppercase">
            Welcome back, {studentName}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight text-white sm:text-3xl">
            {portalName}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/90">
            &ldquo;Leading Innovations, Transforming Lives, Building the Nation.&rdquo;
          </p>
          <p className="mt-1 text-sm leading-relaxed text-white/70">
            Take a moment for yourself today. Your wellbeing is the foundation of every great achievement.
          </p>
        </div>
      </section>

      {/* ─── Stat Cards Row ──────────────────────────────────────────── */}
      {/* Fix #2: Icon backgrounds use only maroon/gold pastel tints */}
      {/* Fix #1: Soft shadows, standardized radius */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Assessments Completed — maroon pastel icon bg */}
        <div className="group rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-pastel)]">
              <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-label">Assessments Completed</p>
              <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">{MOCK_DATA.assessmentsCompleted}/{MOCK_DATA.totalAssessments}</p>
              <p className="type-caption mt-0.5">{MOCK_DATA.totalAssessments - MOCK_DATA.assessmentsCompleted} remaining</p>
            </div>
          </div>
        </div>

        {/* Next Appointment — gold pastel icon bg */}
        <div className="group rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-pastel)]">
              <svg className="h-6 w-6 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-label">Next Appointment</p>
              <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">{MOCK_DATA.nextAppointment}</p>
            </div>
          </div>
        </div>

        {/* Next Check-in — maroon pastel icon bg */}
        <div className="group rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-pastel)]">
              <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-label">Next Check-in</p>
              <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">{MOCK_DATA.nextCheckIn}</p>
            </div>
          </div>
        </div>

        {/* Unread Messages — gold pastel icon bg */}
        <div className="group rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-pastel)]">
              <svg className="h-6 w-6 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.753 9.753 0 01-3.555-.732A5.122 5.122 0 015.634 18 5.125 5.125 0 015.25 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-label">Unread Messages</p>
              <p className="mt-0.5 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">{MOCK_DATA.unreadMessages}</p>
              <p className="type-caption mt-0.5">From your facilitators</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Assessments Section ──────────────────────────────────────── */}
      {user?.role === "student" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Assessment Progress — Fix #3: removed linear bar, added breakdown */}
          <div className="lg:col-span-2 rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-5">
                <CircularProgress value={assessmentPercent} />
                <div>
                  <h3 className="type-section">Assessment Progress</h3>
                  <p className="type-body mt-1">Complete your assessments to track your wellbeing journey.</p>
                  {/* Fix #3: breakdown line replaces linear bar */}
                  <p className="type-caption mt-2">
                    {MOCK_DATA.assessmentsCompleted} completed &middot; {MOCK_DATA.inProgress} in progress &middot; {MOCK_DATA.notStarted} not started
                  </p>
                </div>
              </div>
              {/* Fix #6: hover lift on button */}
              <button
                onClick={() => navigate("/student/assessments/rJNot7eBFTElrRXvj1GG")}
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-button transition-all duration-150 hover:-translate-y-0.5 hover:bg-[var(--color-primary-light)] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                </svg>
                Continue Assessment
              </button>
            </div>
          </div>

          {/* Quick Actions — Fix #6: hover with maroon-tinted bg */}
          {/* Fix #7: extra padding bottom to match assessment card height */}
          <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card pb-8">
            <h3 className="type-section">Quick Actions</h3>
            <div className="mt-4 space-y-2">
              <button onClick={() => navigate("/student/facilitators")} className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-all duration-150 hover:bg-[var(--color-primary-pastel)] hover:text-[var(--color-primary)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-pastel)]">
                  <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                Find a Facilitator
              </button>
              <button onClick={() => navigate("/student/appointments")} className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-all duration-150 hover:bg-[var(--color-primary-pastel)] hover:text-[var(--color-primary)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-pastel)]">
                  <svg className="h-4 w-4 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                Book Appointment
              </button>
              <button onClick={() => navigate("/student/messages")} className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-all duration-150 hover:bg-[var(--color-primary-pastel)] hover:text-[var(--color-primary)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-pastel)]">
                  <svg className="h-4 w-4 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                </div>
                Send a Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Coming Soon / Roadmap ────────────────────────────────────── */}
      <div className="rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="type-section">Coming Soon</h3>
            <p className="type-body mt-1">
              The {portalName} features are currently under development. More wellness tools are on the way:
            </p>
          </div>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-pastel)]">
            <svg className="h-5 w-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Weekly wellness trend charts",
            "Personalized goal setting",
            "Guided journaling prompts",
            "Peer support group matching",
            "Achievement badges & milestones",
            "Group workshop scheduling",
          ].map((feature, i) => (
            <li key={i} className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
              <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-accent)]" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--color-border-light)] pt-6">
        <p className="text-center type-caption">
          &copy; {new Date().getFullYear()} Batangas State University &middot; The National Engineering University
        </p>
      </footer>
    </div>
  );
}