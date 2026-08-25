import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { profileRepository, userService } from '@spartan-g/shared-services';
import { ALL_CAMPUSES, CAMPUS_LABELS, ROLE_LABELS } from '@spartan-g/shared-types';
import type { Campus, Gender } from '@spartan-g/shared-types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'He/Him' },
  { value: 'female', label: 'She/Her' },
  { value: 'non_binary', label: 'They/Them' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

/**
 * Student Profile — displays and manages the student's basic profile
 * information, including their assigned campus (used for cross-campus
 * facilitator filtering, recommendations, and campus-level analytics).
 */
export function StudentProfilePage() {
  const { user, status } = useAuth();
  const [campus, setCampus] = useState<Campus | ''>('');
  const [profile, setProfile] = useState({
    bio: '',
    phone: '',
    institution: '',
    pronouns: '',
    gender: '' as Gender | '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user || status !== 'authenticated') return;
    const load = async () => {
      try {
        setCampus(user.campus ?? '');
        const p = await profileRepository.getById(user.uid);
        if (p) {
          setProfile({
            bio: p.bio || '',
            phone: p.phone || '',
            institution: p.institution || '',
            pronouns: p.pronouns || '',
            gender: p.gender || '',
          });
          if (p.campus) setCampus(p.campus);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [user?.uid, user?.campus, status]);

  const handleSave = async () => {
    if (!user) return;
    if (!campus) {
      setError('Please select your campus.');
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const dataToSave = {
        ...profile,
        gender: profile.gender || undefined,
      };
      await userService.updateCampus(user.role, user.uid, campus, user.uid);
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

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Profile saved successfully!
        </div>
      )}

      <div className="space-y-6">
        <Select
          label="Campus"
          value={campus}
          onChange={(e) => setCampus(e.target.value as Campus)}
        >
          <option value="">Select your campus...</option>
          {ALL_CAMPUSES.map((c) => (
            <option key={c} value={c}>
              {CAMPUS_LABELS[c]}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Pronouns"
            placeholder="e.g., they/them, she/her, he/him"
            value={profile.pronouns}
            onChange={(e) => setProfile({ ...profile, pronouns: e.target.value })}
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Gender</label>
            <select
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={profile.gender}
              onChange={(e) => setProfile({ ...profile, gender: e.target.value as Gender })}
            >
              <option value="">Select gender...</option>
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Bio</label>
          <textarea
            rows={4}
            placeholder="Tell us a little about yourself..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Phone"
            type="tel"
            placeholder="Your contact number"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
          <Input
            label="Institution"
            placeholder="Your institution/organization"
            value={profile.institution}
            onChange={(e) => setProfile({ ...profile, institution: e.target.value })}
          />
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </div>
  );
}

