import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { profileRepository, userService } from '@spartan-g/shared-services';
import { ROLE_LABELS } from '@spartan-g/shared-types';
import type { Campus, Gender } from '@spartan-g/shared-types';
import {
  ProfileSettingsForm,
  type ProfileFormValue,
} from '../../components/profile/ProfileSettingsForm';

const EMPTY_PROFILE: ProfileFormValue = {
  campus: '',
  bio: '',
  phone: '',
  institution: '',
  pronouns: '',
  gender: '',
};

/**
 * Student Profile — displays and manages the student's basic profile
 * information, including their assigned campus (used for cross-campus
 * facilitator filtering, recommendations, and campus-level analytics).
 *
 * Edits the SAME users/profiles documents the Super Admin manages, via the
 * shared ProfileSettingsForm — one profile schema across every portal.
 */
export function StudentProfilePage() {
  const { user, status } = useAuth();
  const [profile, setProfile] = useState<ProfileFormValue>(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user || status !== 'authenticated') return;
    let cancelled = false;
    const load = async () => {
      try {
        const p = await profileRepository.getById(user.uid);
        if (cancelled) return;
        setProfile({
          campus: ((p?.campus as Campus | undefined) ?? user.campus ?? '') as Campus | '',
          bio: p?.bio || '',
          phone: p?.phone || '',
          institution: p?.institution || '',
          pronouns: p?.pronouns || '',
          gender: (p?.gender || '') as Gender | '',
        });
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
  }, [user?.uid, user?.campus, status]);

  const handleSave = async () => {
    if (!user) return;
    if (!profile.campus) {
      setError('Please select your campus.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const dataToSave = {
        bio: profile.bio,
        phone: profile.phone,
        institution: profile.institution,
        pronouns: profile.pronouns,
        gender: profile.gender || undefined,
      };
      await userService.updateCampus(user.role, user.uid, profile.campus, user.uid);
      await userService.updateProfile(user.role, user.uid, dataToSave, user.uid);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (status === 'idle' || status === 'loading' || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header info */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-2xl font-semibold text-[var(--color-primary)]">
          {(user.displayName || 'S').charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">
            {user.displayName || 'Student'}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">{user.email}</p>
          <span className="mt-1 inline-flex items-center rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]">
            {ROLE_LABELS[user.role]}
          </span>
        </div>
      </div>

      <ProfileSettingsForm
        value={profile}
        onChange={setProfile}
        onSave={handleSave}
        isSaving={isSaving}
        error={error}
        success={success}
      />
    </div>
  );
}
