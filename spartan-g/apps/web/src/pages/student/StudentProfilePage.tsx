import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCampuses } from '../../hooks/useCampuses';
import { profileRepository } from '@spartan-g/shared-services';
import { ROLE_LABELS } from '@spartan-g/shared-types';
import type { ProfileDocument } from '@spartan-g/shared-types';
import { GENDER_OPTIONS } from '../../components/profile/ProfileSettingsForm';
import { Card, CardBody } from '../../components/ui/Card';

// ─── Icons (inline SVG, matching the rest of the app) ───────────

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const icons = {
  campus: (
    <Icon>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="M6 10.5V16c0 1.2 2.7 3 6 3s6-1.8 6-3v-5.5" />
    </Icon>
  ),
  institution: (
    <Icon>
      <path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6" />
    </Icon>
  ),
  pronouns: (
    <Icon>
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" />
    </Icon>
  ),
  gender: (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  ),
  phone: (
    <Icon>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    </Icon>
  ),
  email: (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Icon>
  ),
  info: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  ),
};

// ─── Building blocks ────────────────────────────────────────────

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {icon}
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-base font-medium text-[var(--color-text)]">{children}</dd>
    </div>
  );
}

function InfoCard({
  title,
  className = '',
  wide = false,
  children,
}: {
  title: string;
  className?: string;
  /** Full-width card: lay the fields out side by side from the sm breakpoint. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardBody>
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">{title}</h2>
        <dl className={wide ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'space-y-4'}>{children}</dl>
      </CardBody>
    </Card>
  );
}

const NOT_SET = <span className="text-sm font-normal text-[var(--color-text-muted)]">Not set</span>;

/**
 * Student Profile — read-only. Students can no longer edit their profile
 * (enforced by Firestore rules); a super admin maintains these values from
 * Admin → Users → Edit Profile.
 */
export function StudentProfilePage() {
  const { user, status } = useAuth();
  const { campuses } = useCampuses();
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || status !== 'authenticated') return;
    let cancelled = false;
    const load = async () => {
      try {
        const p = await profileRepository.getById(user.uid);
        if (!cancelled) setProfile(p);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, status]);

  if (status === 'idle' || status === 'loading' || !user || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading...</p>
        </div>
      </div>
    );
  }

  const campusKey = (profile?.campus as string | undefined) ?? user.campus ?? '';
  const campusLabel = campuses.find((c) => c.key === campusKey)?.label ?? campusKey;
  const genderLabel = GENDER_OPTIONS.find((g) => g.value === profile?.gender)?.label;
  const show = (value?: string | null) => (value && value.trim() ? value : NOT_SET);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header info */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-2xl font-semibold text-[var(--color-primary)]">
          {(user.displayName || 'S').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold text-[var(--color-text)]">
            {user.displayName || 'Student'}
          </h1>
          <p className="break-all text-sm text-[var(--color-text-secondary)]">{user.email}</p>
          <span className="mt-1 inline-flex items-center rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
            {ROLE_LABELS[user.role]}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <InfoCard title="Campus & Institution">
          <Field label="Campus" icon={icons.campus}>{show(campusLabel)}</Field>
          <Field label="Institution" icon={icons.institution}>{show(profile?.institution)}</Field>
        </InfoCard>

        <InfoCard title="Personal Information">
          <Field label="Pronouns" icon={icons.pronouns}>{show(profile?.pronouns)}</Field>
          <Field label="Gender" icon={icons.gender}>{show(genderLabel)}</Field>
        </InfoCard>

        <InfoCard title="Contact" className="md:col-span-2" wide>
          <Field label="Phone" icon={icons.phone}>{show(profile?.phone)}</Field>
          <Field label="Email" icon={icons.email}>
            <span className="break-all">{user.email}</span>
          </Field>
        </InfoCard>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        <span className="mt-0.5 text-[var(--color-info)]">{icons.info}</span>
        <p>To update your profile, contact your administrator.</p>
      </div>
    </div>
  );
}
