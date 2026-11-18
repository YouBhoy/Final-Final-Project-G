import { StaffProfileBanner } from "../../components/StaffProfileBanner";
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAdminDashboard } from '../../hooks/useAdminDashboard';
import { dashboardOverview } from '../../lib/adminDashboard';
import { Card } from '../../components/ui/Card';

const linkStyle = 'text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4';
const muted = 'text-[var(--color-text-secondary)]';
function Message({ loading, error, children }: { loading: boolean; error: string | null; children: ReactNode }) {
  if (loading) return <p role="status" className={`py-5 text-sm ${muted}`}>Loading...</p>;
  if (error) return <p role="alert" className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  return <>{children}</>;
}

function DashboardContent() {
  const { users, campuses, submissions, statistics, loading, refresh } = useAdminDashboard();
  const overview = dashboardOverview(users.data ?? [], campuses.data ?? [], []);
  const coverageError = users.error || campuses.error;
  const coverageLoading = users.loading || campuses.loading;
  const cards = [
    { label: 'Total students', value: overview.students.length, description: 'All registered student accounts', to: '/admin/users?role=student', loading: users.loading, error: users.error },
    { label: 'Active facilitators', value: overview.facilitators.length, description: 'Accounts enabled to support students', to: '/admin/users?role=facilitator', loading: users.loading, error: users.error },
    { label: 'Active campuses', value: overview.campuses.filter(campus => campus.isActive).length, description: 'Enabled campuses across the platform', to: '/admin/campuses', loading: campuses.loading, error: campuses.error },
    { label: 'Assessments submitted', value: submissions.data, description: 'This month to date', to: '/admin/statistics', loading: submissions.loading, error: submissions.error },
  ];
  return <div className="staff-dashboard space-y-6">
    <StaffProfileBanner role="Super admin" description="A clear view of your campuses, support coverage, and platform activity." loading={loading} onRefresh={refresh} />

    <section aria-label="Platform summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => <Card key={card.label} className="flex flex-col p-5">
        <h2 className={`text-sm font-medium ${muted}`}>{card.label}</h2>
        <div className="mt-3 flex-1"><Message loading={card.loading} error={card.error}><p className="text-4xl font-bold tracking-tight text-[var(--color-text)]">{card.value?.toLocaleString()}</p></Message></div>
        <p className={`mt-3 text-xs ${muted}`}>{card.description}</p><Link className={`${linkStyle} mt-4 self-start`} to={card.to}>View details <span aria-hidden="true">→</span></Link>
      </Card>)}
    </section>

    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold text-[var(--color-text)]">Statistics at a glance</h2><p className={`mt-1 text-sm ${muted}`}>This month to date, across all campuses.</p></div>
        <Link to="/admin/statistics" className={linkStyle}>View full statistics</Link>
      </div>
      <Message loading={statistics.loading} error={statistics.error}>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Participating students', value: statistics.data?.participants, description: 'Students with recorded activity' },
            { label: 'Appointment requests', value: statistics.data?.appointmentRequests, description: 'Requests created this month' },
            { label: 'Students messaging', value: statistics.data?.messagingStudents, description: 'Students who sent a message' },
          ].map(metric => <div key={metric.label} className="rounded-xl border border-[var(--color-border)] p-4">
            <dt className={`text-sm ${muted}`}>{metric.label}</dt>
            <dd className="mt-2 text-3xl font-bold text-[var(--color-primary)]">{metric.value?.toLocaleString() ?? 'Unavailable'}</dd>
            <dd className={`mt-2 text-xs ${muted}`}>{metric.description}</dd>
          </div>)}
        </dl>
      </Message>
    </Card>



    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold text-[var(--color-text)]">Campus overview</h2><p className={`mt-1 text-sm ${muted}`}>Active student and facilitator accounts by campus.</p></div><Link className={linkStyle} to="/admin/campuses">Manage campuses</Link></div>
      <Message loading={coverageLoading} error={coverageError}>
        <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{overview.campuses.map(campus => <li key={campus.key} className="rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-sm font-semibold text-[var(--color-text)]">{campus.label}</p><p className={`mt-2 text-sm ${muted}`}>{campus.students.toLocaleString()} students · {campus.facilitators.toLocaleString()} facilitators</p>
          <p className={`mt-3 text-xs font-medium ${!campus.isActive ? muted : campus.facilitators === 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{!campus.isActive ? 'Campus inactive' : campus.facilitators === 0 ? 'Needs facilitator coverage' : 'Facilitator coverage available'}</p>
        </li>)}</ul>
      </Message>
    </Card>

    <p className={`text-xs ${muted}`}>Overview loads when you open this page. Refresh to retrieve updates; assessment totals use the Statistics reporting cache.</p>
  </div>;
}

export function AdminDashboardPage() {
  const { user } = useAuth();
  if (user?.role !== 'super_admin') return <p role="alert" className="text-red-700">The admin dashboard requires a super administrator account.</p>;
  return <DashboardContent key={user.uid} />;
}
