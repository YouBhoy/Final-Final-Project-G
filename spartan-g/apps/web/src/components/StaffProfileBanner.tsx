import { useAuth } from '../hooks/useAuth';
import { CAMPUS_LABELS } from '@spartan-g/shared-types';
import { Avatar } from './ui/Avatar';

export function StaffProfileBanner({ role, description, loading, onRefresh }: {
  role: string;
  description: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const name = user?.displayName || role;
  const campus = user?.campus
    ? (CAMPUS_LABELS as Record<string, string>)[user.campus] || user.campus
    : 'Platform-wide';
  const today = new Date().toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });

  return (
    <header className="student-profile-banner staff-profile-banner">
      <div className="student-profile-main staff-profile-main">
        <Avatar name={name} size="hero" shape="tile" className="student-monogram" />
        <div className="staff-profile-copy">
          <p className="student-eyebrow">Your {role.toLowerCase()} workspace</p>
          <h1>{name}</h1>
          <p className="student-email">{user?.email}</p>
          <span className="student-role-pill">{role} portal</span>
        </div>
      </div>

      <dl className="staff-profile-meta">
        <div>
          <dt>{user?.campus ? 'Campus' : 'Scope'}</dt>
          <dd>{campus}</dd>
        </div>
        <div>
          <dt>Today</dt>
          <dd>{today}</dd>
        </div>
      </dl>

      <div className="student-profile-footer staff-profile-footer">
        <p>{description}</p>
        <button className="student-soft-button" disabled={loading} onClick={onRefresh}>
          {loading ? 'Refreshing…' : 'Refresh overview ↻'}
        </button>
      </div>
    </header>
  );
}
