import { getFunctions, httpsCallable } from "firebase/functions";
import {
  AppError,
  PERMISSIONS,
  PermissionError,
  hasPermission,
  type Role,
} from "@spartan-g/shared-types";
import { app } from "../firebase/firebase";

/**
 * Super-admin editing of a STUDENT's profile. Web-only on purpose: it lives in
 * apps/web (not in shared-services) so the mobile bundle never contains it.
 * The `adminUpdateStudentProfile` Cloud Function re-checks the caller is an
 * active super admin and the target is a student, and re-validates every value.
 */

// Mirrors the validation in firebase/functions/src/adminStudentProfile.ts.
const LIMITS = { bio: 1000, pronouns: 50, institution: 150 } as const;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{5,19}$/;
const GENDERS = ["male", "female", "non_binary", "other", "prefer_not_to_say"];

export interface SaveStudentProfileInput {
  actorRole: Role;
  targetUid: string;
  campus: string;
  bio: string;
  phone: string;
  institution: string;
  pronouns: string;
  gender: string;
}

function invalid(message: string) {
  return new AppError(message, "admin/invalid-input");
}

function mapCallableError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: string }).code) : "";
  const message = typeof error === "object" && error !== null && "message" in error ? String((error as { message: string }).message) : "";

  if (code === "functions/not-found") {
    return new AppError(
      "Unable to update the student profile: the admin backend function is not deployed yet.",
      "admin/function-unavailable",
      error,
    );
  }
  if (code === "functions/permission-denied") {
    return new PermissionError(message || "Only an active Super Admin can perform this action");
  }
  if (code === "functions/failed-precondition" || code === "functions/invalid-argument") {
    return new AppError(message || "Unable to update the student profile", "admin/invalid-input", error);
  }
  return new AppError(message || "Failed to update the student profile", "admin/callable-failed", error);
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

  try {
    const fn = httpsCallable<Record<string, string>, { ok: boolean; changedFields: string[] }>(
      getFunctions(app),
      "adminUpdateStudentProfile",
    );
    const result = await fn({
      targetUid: input.targetUid,
      campus: input.campus.trim(),
      bio: input.bio,
      phone: input.phone,
      institution: input.institution,
      pronouns: input.pronouns,
      gender: input.gender,
    });
    return { changedFields: result.data.changedFields };
  } catch (error) {
    throw mapCallableError(error);
  }
}
