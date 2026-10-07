import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, type Timestamp } from "firebase/firestore";
import { AppError, PERMISSIONS, PermissionError, hasPermission, type Role } from "@spartan-g/shared-types";
import { assessmentService, auditService } from "@spartan-g/shared-services";
import { db } from "../firebase/firebase";

/**
 * Super-admin attempt-limit overrides. Web-only on purpose: this lives in
 * apps/web (not shared-services) so the mobile bundle never contains it.
 *
 * Overrides are stored in `assessment_overrides/{assessmentId}_{studentId}` with
 * the same fields the mobile app reads. Firestore rules let only an active super
 * admin create, change or remove one, and validate the cap (1-10), the reason and
 * the document id, so these writes go straight to Firestore (no Cloud Function).
 */

export const MIN_OVERRIDE_ATTEMPTS = 1;
export const MAX_OVERRIDE_ATTEMPTS = 10;
export const MAX_REASON_LENGTH = 500;

export interface AssessmentOption {
  id: string;
  title: string;
  /** The assessment's default limit (`maxAttempts`). */
  defaultMaxAttempts: number;
}

export interface StudentOverride {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  maxAttemptsOverride: number;
  reason: string;
  grantedBy: string;
  grantedAt: Date | null;
}

export interface OverrideContext {
  attemptsUsed: number;
  defaultMaxAttempts: number;
  override: StudentOverride | null;
  /** The override itself when one exists, otherwise the default. */
  effectiveMax: number;
}

const toDate = (value: unknown): Date | null =>
  value && typeof (value as Timestamp).toDate === "function" ? (value as Timestamp).toDate() : null;

/** Published assessment definitions (the ones students can take). */
export async function listAssessmentOptions(): Promise<AssessmentOption[]> {
  const snapshot = await getDocs(collection(db, "assessments"));
  const options: AssessmentOption[] = [];
  snapshot.forEach((d) => {
    const data = d.data();
    if (typeof data.courseId === "string" && data.courseId) {
      options.push({
        id: d.id,
        title: String(data.title ?? d.id),
        defaultMaxAttempts: typeof data.maxAttempts === "number" ? data.maxAttempts : 0,
      });
    }
  });
  return options.sort((a, b) => a.title.localeCompare(b.title));
}

function toOverride(id: string, data: Record<string, unknown>, titles: Map<string, string>): StudentOverride {
  const assessmentId = String(data.assessmentId ?? "");
  return {
    id,
    assessmentId,
    assessmentTitle: titles.get(assessmentId) ?? assessmentId,
    maxAttemptsOverride: Number(data.maxAttemptsOverride ?? 0),
    reason: typeof data.reason === "string" ? data.reason : "",
    grantedBy: String(data.grantedBy ?? ""),
    grantedAt: toDate(data.grantedAt),
  };
}

/** Every active override for one student, with assessment titles. */
export async function listStudentOverrides(studentId: string): Promise<StudentOverride[]> {
  const [snapshot, options] = await Promise.all([
    getDocs(query(collection(db, "assessment_overrides"), where("studentId", "==", studentId))),
    listAssessmentOptions(),
  ]);
  const titles = new Map(options.map((o) => [o.id, o.title]));
  return snapshot.docs.map((d) => toOverride(d.id, d.data(), titles));
}

/** Attempts used, default limit and current override for one student + assessment. */
export async function getOverrideContext(
  assessment: AssessmentOption,
  studentId: string,
): Promise<OverrideContext> {
  const [attemptsUsed, snap] = await Promise.all([
    assessmentService.getAttemptCount(assessment.id, studentId),
    getDoc(doc(db, "assessment_overrides", `${assessment.id}_${studentId}`)),
  ]);
  const override = snap.exists()
    ? toOverride(snap.id, snap.data(), new Map([[assessment.id, assessment.title]]))
    : null;
  const effectiveMax =
    override && override.maxAttemptsOverride > 0 ? override.maxAttemptsOverride : assessment.defaultMaxAttempts;
  return { attemptsUsed, defaultMaxAttempts: assessment.defaultMaxAttempts, override, effectiveMax };
}

function invalid(message: string) {
  return new AppError(message, "admin/invalid-input");
}

function mapFirestoreError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: string }).code) : "";
  if (code === "permission-denied") {
    return new PermissionError("Only an active Super Admin can change attempt limits, and the student and values must be valid.");
  }
  const message = error instanceof Error ? error.message : "";
  return new AppError(message || "Failed to save the override", "admin/write-failed", error);
}

interface OverrideInput {
  actorRole: Role;
  actorUid: string;
  actorEmail?: string | null;
  studentId: string;
  assessmentId: string;
  reason: string;
}

function checkCommon(input: OverrideInput) {
  if (!hasPermission(input.actorRole, PERMISSIONS.MANAGE_USERS)) throw new PermissionError();
  if (!input.reason.trim()) throw invalid("Please enter a reason.");
  if (input.reason.trim().length > MAX_REASON_LENGTH) {
    throw invalid(`Reason must be at most ${MAX_REASON_LENGTH} characters.`);
  }
}

export interface OverrideWriteResult {
  changed: boolean;
  /** True when the override was saved but its audit entry could not be written. */
  auditFailed: boolean;
}

async function recordAudit(
  input: OverrideInput,
  action: "SUPERADMIN_SET_ASSESSMENT_OVERRIDE" | "SUPERADMIN_REMOVED_ASSESSMENT_OVERRIDE",
  docId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  try {
    await auditService.record({
      actorId: input.actorUid,
      actorEmail: input.actorEmail ?? null,
      action,
      resource: "assessment_overrides",
      resourceId: docId,
      metadata: { targetUserId: input.studentId, targetUserRole: "student", assessmentId: input.assessmentId, ...metadata },
    });
    return false;
  } catch {
    return true;
  }
}

/** Set (or change) the override. `attemptsUsed` is the count of submitted/graded attempts. */
export async function setAttemptOverride(
  input: OverrideInput & { maxAttempts: number; attemptsUsed: number; defaultMaxAttempts: number },
): Promise<OverrideWriteResult> {
  checkCommon(input);
  if (!Number.isInteger(input.maxAttempts)) throw invalid("Attempts must be a whole number.");
  if (input.maxAttempts < MIN_OVERRIDE_ATTEMPTS || input.maxAttempts > MAX_OVERRIDE_ATTEMPTS) {
    throw invalid(`Attempts must be from ${MIN_OVERRIDE_ATTEMPTS} to ${MAX_OVERRIDE_ATTEMPTS}.`);
  }
  if (input.maxAttempts < input.attemptsUsed) {
    throw invalid(`The student has already used ${input.attemptsUsed}; the new limit must be at least ${input.attemptsUsed}.`);
  }

  const docId = `${input.assessmentId}_${input.studentId}`;
  const ref = doc(db, "assessment_overrides", docId);
  const reason = input.reason.trim();
  try {
    const existing = await getDoc(ref);
    const previous = existing.exists() ? (existing.data().maxAttemptsOverride as number) : null;
    if (existing.exists() && previous === input.maxAttempts && existing.data().reason === reason) {
      return { changed: false, auditFailed: false };
    }
    // Same fields as the mobile app: assessmentId, studentId, maxAttemptsOverride, grantedBy, grantedAt, reason.
    await setDoc(ref, {
      assessmentId: input.assessmentId,
      studentId: input.studentId,
      maxAttemptsOverride: input.maxAttempts,
      grantedBy: input.actorUid,
      grantedAt: serverTimestamp(),
      reason,
    });
    const auditFailed = await recordAudit(input, "SUPERADMIN_SET_ASSESSMENT_OVERRIDE", docId, {
      previousValue: previous,
      newValue: input.maxAttempts,
      defaultMaxAttempts: input.defaultMaxAttempts,
      attemptsUsed: input.attemptsUsed,
      reason,
    });
    return { changed: true, auditFailed };
  } catch (error) {
    throw mapFirestoreError(error);
  }
}

/** Remove the override so the assessment default applies again. */
export async function removeAttemptOverride(
  input: OverrideInput & { defaultMaxAttempts: number },
): Promise<OverrideWriteResult> {
  checkCommon(input);
  const docId = `${input.assessmentId}_${input.studentId}`;
  const ref = doc(db, "assessment_overrides", docId);
  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) throw invalid("There is no override to remove.");
    const previous = existing.data().maxAttemptsOverride as number;
    await deleteDoc(ref);
    const auditFailed = await recordAudit(input, "SUPERADMIN_REMOVED_ASSESSMENT_OVERRIDE", docId, {
      previousValue: previous,
      newValue: null,
      defaultMaxAttempts: input.defaultMaxAttempts,
      reason: input.reason.trim(),
    });
    return { changed: true, auditFailed };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw mapFirestoreError(error);
  }
}
