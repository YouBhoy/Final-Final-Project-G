import {
  AppError,
  PERMISSIONS,
  PermissionError,
  hasPermission,
  type Gender,
  type Role,
} from "@spartan-g/shared-types";
import type { Campus } from "@spartan-g/shared-types";
import { adminService } from "@spartan-g/shared-services";

/**
 * Super-admin editing of a STUDENT's profile. Web-only on purpose: it lives in
 * apps/web (not in shared-services) so the mobile bundle never contains it.
 * Writes use the existing Firestore repositories and security rules, so this
 * profile edit does not require a deployed Cloud Function or the Blaze plan.
 */

// Validate profile values before the Firestore-backed admin service writes them.
const LIMITS = { bio: 1000, pronouns: 50, institution: 150 } as const;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{5,19}$/;
const GENDERS = ["male", "female", "non_binary", "other", "prefer_not_to_say"];

export interface SaveStudentProfileInput {
  actorRole: Role;
  actorUid: string;
  actorEmail?: string | null;
  targetUid: string;
  targetRole: Role;
  campus: string;
  bio: string;
  phone: string;
  institution: string;
  pronouns: string;
  gender: string;
  changedFields: string[];
}

function invalid(message: string) {
  return new AppError(message, "admin/invalid-input");
}

export async function saveStudentProfile(input: SaveStudentProfileInput): Promise<{ changedFields: string[] }> {
  if (!hasPermission(input.actorRole, PERMISSIONS.MANAGE_USERS)) throw new PermissionError();

  if (!input.campus.trim()) throw invalid("Please select a campus.");
  if (input.bio.trim().length > LIMITS.bio) throw invalid(`Bio must be at most ${LIMITS.bio} characters.`);
  if (input.pronouns.trim().length > LIMITS.pronouns) {
    throw invalid(`Pronouns must be at most ${LIMITS.pronouns} characters.`);
  }
  if (input.institution.trim().length > LIMITS.institution) {
    throw invalid(`Institution must be at most ${LIMITS.institution} characters.`);
  }
  if (input.phone.trim() && !PHONE_PATTERN.test(input.phone.trim())) {
    throw invalid("Enter a valid phone number (6-20 digits, optional +).");
  }
  if (input.gender && !GENDERS.includes(input.gender)) throw invalid("Choose a valid gender option.");

  await adminService.saveUserProfile({
    actorRole: input.actorRole,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    targetUid: input.targetUid,
    targetRole: input.targetRole,
    campus: input.campus.trim() as Campus,
    profileFields: {
      bio: input.bio,
      phone: input.phone,
      institution: input.institution,
      pronouns: input.pronouns,
      gender: (input.gender || undefined) as Gender | undefined,
    },
    changedFields: input.changedFields,
  });
  return { changedFields: input.changedFields };
}
