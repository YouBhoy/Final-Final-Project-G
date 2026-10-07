import { COLLECTIONS } from '@spartan-g/shared-types';
import type { Timestamp } from '../firebase/firestore';
import { getDoc, doc, getFirestoreDb } from '../firebase/firestore';

/**
 * Per-student, per-assessment attempt-limit override.
 *
 * Document id: `{assessmentId}_{studentId}`. This is the same shape the mobile
 * app (origin/app) reads. On this branch overrides are WRITTEN only by the
 * `superAdminOverrideAttempts` Cloud Function — clients just read them.
 */
export interface AssessmentOverrideDocument {
  assessmentId: string;
  studentId: string;
  /** Absolute cap that replaces the assessment's default `maxAttempts`. 1–10. */
  maxAttemptsOverride: number;
  grantedBy: string;
  grantedAt: Timestamp;
  reason?: string;
}

export function assessmentOverrideId(assessmentId: string, studentId: string): string {
  return `${assessmentId}_${studentId}`;
}

class AssessmentOverrideService {
  /** The override document for a student + assessment, or null when none exists. */
  async getOverride(
    assessmentId: string,
    studentId: string,
  ): Promise<(AssessmentOverrideDocument & { id: string }) | null> {
    const id = assessmentOverrideId(assessmentId, studentId);
    const snapshot = await getDoc(doc(getFirestoreDb(), COLLECTIONS.ASSESSMENT_OVERRIDES, id));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...(snapshot.data() as AssessmentOverrideDocument) };
  }

  /**
   * The attempt limit that applies to this student: the override itself when
   * one exists (> 0), otherwise the assessment's default. The server-side rule
   * on `assessment_attempts` uses the same definition.
   */
  async getEffectiveMaxAttempts(
    assessmentId: string,
    studentId: string,
    defaultMaxAttempts: number,
  ): Promise<number> {
    try {
      const override = await this.getOverride(assessmentId, studentId);
      if (override && override.maxAttemptsOverride > 0) return override.maxAttemptsOverride;
    } catch (error) {
      // A read failure must not block the student from starting; the Firestore rule on
      // assessment_attempts is the authoritative check. Log it so a mismatch between
      // this client check and that rule can be traced instead of staying invisible.
      const code = (error as { code?: string })?.code ?? 'unknown';
      console.warn(
        `[AssessmentOverrideService] could not read the override (${code}); using the default limit of ${defaultMaxAttempts}.`,
      );
    }
    return defaultMaxAttempts;
  }
}

export const assessmentOverrideService = new AssessmentOverrideService();
