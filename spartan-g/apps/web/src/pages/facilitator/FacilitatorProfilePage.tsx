import { useEffect, useState } from 'react';
import { profileRepository } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { Gender } from '@spartan-g/shared-types';
import { Button } from '../../components/ui/Button';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'He/Him' },
  { value: 'female', label: 'She/Her' },
  { value: 'non_binary', label: 'They/Them' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export function FacilitatorProfilePage() {
  const { user, status } = useAuth();
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
    const loadProfile = async () => {
      try {
        const p = await profileRepository.getById(user.uid);
        if (p) {
          setProfile({
            bio: p.bio || '',
            phone: p.phone || '',
            institution: p.institution || '',
            pronouns: p.pronouns || '',
            gender: p.gender || '',
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setIsLoading(false);
      }
    };
    loadProfile();
  }, [user?.uid, status]);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      // Convert empty string to undefined for gender
      const dataToSave = {
        ...profile,
        gender: profile.gender || undefined,
      };
      await profileRepository.update(user.uid, dataToSave);
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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">My Profile</h1>

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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="pronouns">Pronouns</label>
          <input
            id="pronouns"
            type="text"
            placeholder="e.g., they/them, she/her, he/him"
            value={profile.pronouns}
            onChange={e => setProfile({ ...profile, pronouns: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="gender">Gender</label>
          <select
            id="gender"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            value={profile.gender}
            onChange={e => setProfile({ ...profile, gender: e.target.value as Gender })}
          >
            <option value="">Select gender...</option>
            {GENDER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            rows={4}
            placeholder="Tell students about yourself..."
            value={profile.bio}
            onChange={e => setProfile({ ...profile, bio: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="phone">Phone</label>
          <input
            id="phone"
            type="tel"
            placeholder="Your contact number"
            value={profile.phone}
            onChange={e => setProfile({ ...profile, phone: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="institution">Institution</label>
          <input
            id="institution"
            type="text"
            placeholder="Your institution/organization"
            value={profile.institution}
            onChange={e => setProfile({ ...profile, institution: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </div>
  );
}