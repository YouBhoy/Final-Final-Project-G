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
  const { users, campuses, links, activity, submissions, loading, refresh } = useAdminDashboard();
  const overview = dashboardOverview(users.data ?? [], campuses.data ?? [], links.data ?? []);
  const coverageError = users.error || campuses.error;
  const coverageLoading = users.loading || campuses.loading;
  const attentionError = coverageError || links.error;
  const attentionLoading = coverageLoading || links.loading;
  const cards = [
    { label: 'Total students', value: overview.students.length, description: 'All registered student accounts', to: '/admin/users?role=student', loading: users.loading, error: users.error },
    { label: 'Active facilitators', value: overview.facilitators.length, description: 'Accounts enabled to support students', to: '/admin/users?role=facilitator', loading: users.loading, error: users.error },
    { label: 'Active campuses', value: overview.campuses.filter(campus => campus.isActive).length, description: 'Enabled campuses across the platform', to: '/admin/campuses', loading: campuses.loading, error: campuses.error },
    { label: 'Assessments submitted', value: submissions.data, description: 'This month to date · Manila time', to: '/admin/statistics', loading: submissions.loading, error: submissions.error },
  ];
  const names = new Map((users.data ?? []).map(user => [user.id, user.displayName || user.email]));
  return <div className="space-y-6">
    <section className="relative overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-primary)] px-6 py-8 text-white sm:px-8">
      <div className="absolute inset-y-0 left-0 w-1 bg-[var(--color-accent)]" />
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">SPARTAN-G · Platform overview</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Admin Dashboard</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/80">A clear view of your campuses, student support coverage, and recent platform activity.</p></div>
        <button type="button" className="rounded-lg border border-white/50 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60" disabled={loading} onClick={refresh}>{loading ? 'Loading overview...' : 'Refresh overview'}</button>
      </div>
    </section>

    <section aria-label="Platform summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => <Card key={card.label} className="flex flex-col p-5">
        <h2 className={`text-sm font-medium ${muted}`}>{card.label}</h2>
        <div className="mt-3 flex-1"><Message loading={card.loading} error={card.error}><p className="text-4xl font-bold tracking-tight text-[var(--color-text)]">{card.value?.toLocaleString()}</p></Message></div>
        <p className={`mt-3 text-xs ${muted}`}>{card.description}</p><Link className={`${linkStyle} mt-4 self-start`} to={card.to}>View details <span aria-hidden="true">→</span></Link>
      </Card>)}
    </section>

    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-[var(--color-text)]">Needs attention</h2><span className="rounded-full bg-[var(--color-accent-pastel)] px-3 py-1 text-xs font-medium text-[var(--color-text)]">Support coverage</span></div>
        <p className={`mt-1 text-sm ${muted}`}>Review connections and campus staffing.</p>
        <Message loading={attentionLoading} error={attentionError}>
          <div className="mt-5 space-y-5">
            <div><h3 className="font-semibold text-[var(--color-text)]">{overview.unlinked.length.toLocaleString()} students without an active facilitator connection</h3><p className={`mt-1 text-xs leading-5 ${muted}`}>Active students with no accepted connection to an active facilitator.</p>
              {overview.unlinked.length ? <ul className="mt-3 divide-y divide-[var(--color-border)]">{overview.unlinked.slice(0, 5).map(student => <li key={student.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate text-sm text-[var(--color-text)]">{student.displayName || student.email}</span><Link to={`/admin/users/${encodeURIComponent(student.id)}`} className={`${linkStyle} shrink-0`} aria-label={`Review ${student.displayName || student.email}`}>Review</Link></li>)}</ul> : <p className="mt-2 text-sm text-emerald-700">All active students have an active facilitator connection.</p>}
              {overview.unlinked.length > 5 && <p className={`mt-2 text-xs ${muted}`}>Showing 5 of {overview.unlinked.length} students.</p>}
            </div>
            <div className="border-t border-[var(--color-border)] pt-4"><h3 className="font-semibold text-[var(--color-text)]">{overview.uncovered.length} campuses without active facilitators</h3>
              {overview.uncovered.length ? <ul className="mt-2 space-y-2">{overview.uncovered.map(campus => <li key={campus.key}><Link className={linkStyle} to={`/admin/users?role=facilitator&campus=${encodeURIComponent(campus.key)}`}>{campus.label} <span aria-hidden="true">→</span></Link></li>)}</ul> : <p className="mt-2 text-sm text-emerald-700">Every active campus has facilitator coverage.</p>}
            </div>
          </div>
        </Message>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-[var(--color-text)]">Recent admin activity</h2><Link to="/admin/audit-logs" className={linkStyle}>View audit log</Link></div>
        <p className={`mt-1 text-sm ${muted}`}>The latest six entries from the platform audit trail.</p>
        <Message loading={activity.loading} error={activity.error}>
          {activity.data?.length ? <ul className="mt-4 divide-y divide-[var(--color-border)]">{activity.data.map(row => <li key={row.id} className="py-4">
            <p className="text-sm font-semibold capitalize text-[var(--color-text)]">{row.action.replace(/^SUPERADMIN_/, '').replace(/_/g, ' ').toLowerCase()}</p>
            <p className={`mt-1 break-words text-xs ${muted}`}>{names.get(row.actorId) || String(row.metadata?.adminEmail || row.actorId)} · {names.get(row.resourceId) || String(row.metadata?.resourceName || row.resource)}</p>
            <p className={`mt-1 text-xs ${muted}`}>{row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) + ' · Manila' : 'Time unavailable'}</p>
          </li>)}</ul> : <p className={`py-6 text-sm ${muted}`}>No admin activity yet. Account, campus, and resource changes will appear here.</p>}
        </Message>
      </Card>
    </div>

    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold text-[var(--color-text)]">Campus overview</h2><p className={`mt-1 text-sm ${muted}`}>Active student and facilitator accounts by campus.</p></div><Link className={linkStyle} to="/admin/campuses">Manage campuses</Link></div>
      <Message loading={coverageLoading} error={coverageError}>
        <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{overview.campuses.map(campus => <li key={campus.key} className="rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-sm font-semibold text-[var(--color-text)]">{campus.label}</p><p className={`mt-2 text-sm ${muted}`}>{campus.students.toLocaleString()} students · {campus.facilitators.toLocaleString()} facilitators</p>
          <p className={`mt-3 text-xs font-medium ${!campus.isActive ? muted : campus.facilitators === 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{!campus.isActive ? 'Campus inactive' : campus.facilitators === 0 ? 'Needs facilitator coverage' : 'Facilitator coverage available'}</p>
        </li>)}</ul>
      </Message>
    </Card>

    <section aria-labelledby="admin-quick-actions"><h2 id="admin-quick-actions" className="mb-3 text-lg font-semibold text-[var(--color-text)]">Quick actions</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      { to: '/admin/users', title: 'Manage users', description: 'Review accounts and campus assignments' },
      { to: '/admin/campuses', title: 'Manage campuses', description: 'Update campus details and availability' },
      { to: '/admin/resources', title: 'Manage resources', description: 'Add or update student support resources' },
      { to: '/admin/statistics', title: 'Open statistics', description: 'Explore participation and assessment trends' },
    ].map(action => <Link key={action.to} to={action.to} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"><span className="font-semibold text-[var(--color-primary)]">{action.title} <span aria-hidden="true">→</span></span><span className={`mt-1 block text-xs leading-5 ${muted}`}>{action.description}</span></Link>)}</div></section>
    <p className={`text-xs ${muted}`}>Overview loads when you open this page. Refresh to retrieve updates; assessment totals use the Statistics reporting cache.</p>
  </div>;
}

export function AdminDashboardPage() {
  const { user } = useAuth();
  if (user?.role !== 'super_admin') return <p role="alert" className="text-red-700">The admin dashboard requires a super administrator account.</p>;
  return <DashboardContent key={user.uid} />;
}
