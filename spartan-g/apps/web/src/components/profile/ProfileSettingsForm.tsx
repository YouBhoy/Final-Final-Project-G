import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import {
  ALL_CAMPUSES,
  CAMPUS_LABELS,
  type Campus,
  type Gender,
} from "@spartan-g/shared-types";

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "male", label: "He/Him" },
  { value: "female", label: "She/Her" },
  { value: "non_binary", label: "They/Them" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export interface ProfileFormValue {
  campus: Campus | "";
  bio: string;
  phone: string;
  institution: string;
  pronouns: string;
  gender: Gender | "";
}

interface ProfileSettingsFormProps {
  value: ProfileFormValue;
  onChange: (value: ProfileFormValue) => void;
  onSave: () => void;
  isSaving: boolean;
  error: string | null;
  success: boolean;
  successMessage?: string;
  /** Optional helper text shown under the campus select. */
  campusHint?: string;
  saveLabel?: string;
  /**
   * Replaces the default Save button — lets callers add extra buttons
   * (e.g. Cancel) while keeping the same field layout.
   */
  actions?: ReactNode;
}

/**
 * The shared profile editor used by the Student, Facilitator and
 * Super Admin portals — one form, one set of profile fields, backed by the
 * same `users` + `profiles` documents. Reused instead of duplicated so the
 * three portals stay visually and behaviourally consistent.
 */
export function ProfileSettingsForm({
  value,
  onChange,
  onSave,
  isSaving,
  error,
  success,
  successMessage = "Profile saved successfully!",
  campusHint,
  saveLabel = "Save Profile",
  actions,
}: ProfileSettingsFormProps) {
  const set = (patch: Partial<ProfileFormValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
          {successMessage}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="profile-campus" className="block text-sm font-medium text-gray-700">
          Campus
        </label>
        <select
          id="profile-campus"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={value.campus}
          onChange={(e) => set({ campus: e.target.value as Campus })}
        >
          <option value="">Select your campus...</option>
          {ALL_CAMPUSES.map((c) => (
            <option key={c} value={c}>
              {CAMPUS_LABELS[c]}
            </option>
          ))}
        </select>
        {campusHint && <p className="text-xs text-gray-500">{campusHint}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Pronouns"
          placeholder="e.g., they/them, she/her, he/him"
          value={value.pronouns}
          onChange={(e) => set({ pronouns: e.target.value })}
        />
        <div className="space-y-1">
          <label htmlFor="profile-gender" className="block text-sm font-medium text-gray-700">
            Gender
          </label>
          <select
            id="profile-gender"
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            value={value.gender}
            onChange={(e) => set({ gender: e.target.value as Gender })}
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
        <label htmlFor="profile-bio" className="block text-sm font-medium text-gray-700">
          Bio
        </label>
        <textarea
          id="profile-bio"
          rows={4}
          placeholder="Tell us a little about yourself..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={value.bio}
          onChange={(e) => set({ bio: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Phone"
          type="tel"
          placeholder="Your contact number"
          value={value.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
        <Input
          label="Institution"
          placeholder="Your institution/organization"
          value={value.institution}
          onChange={(e) => set({ institution: e.target.value })}
        />
      </div>

      {actions ?? (
        <Button onClick={onSave} disabled={isSaving} className="w-full">
          {isSaving ? "Saving..." : saveLabel}
        </Button>
      )}
    </div>
  );
}
