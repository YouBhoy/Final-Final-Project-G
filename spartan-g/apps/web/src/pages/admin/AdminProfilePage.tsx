import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { profileRepository, userService } from "@spartan-g/shared-services";
import { ROLE_LABELS, type Campus, type Gender } from "@spartan-g/shared-types";
import {
  ProfileSettingsForm,
  type ProfileFormValue,
} from "../../components/profile/ProfileSettingsForm";

const EMPTY_PROFILE: ProfileFormValue = {
  campus: "",
  bio: "",
  phone: "",
  institution: "",
  pronouns: "",
  gender: "",
};

/**
 * Super Admin — own profile. Same shared form + same users/profiles
 * documents as the Student and Facilitator profile pages.
 */
export function AdminProfilePage() {
  const { user, status } = useAuth();
  const [profile, setProfile] = useState<ProfileFormValue>(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user || status !== "authenticated") return;
    let cancelled = false;
    const load = async () => {
      try {
        const p = await profileRepository.getById(user.uid);
        if (cancelled) return;
        setProfile({
          campus: ((p?.campus as Campus | undefined) ?? user.campus ?? "") as Campus | "",
          bio: p?.bio || "",
          phone: p?.phone || "",
          institution: p?.institution || "",
          pronouns: p?.pronouns || "",
          gender: (p?.gender || "") as Gender | "",
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load profile");
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
      setError("Please select your campus.");
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
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "idle" || status === "loading" || !user || isLoading) {
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
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-2xl font-semibold text-[var(--color-primary)]">
          {(user.displayName || "A").charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Profile</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
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
