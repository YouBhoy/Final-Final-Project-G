import { Timestamp, serverTimestamp, getDoc, doc, getFirestoreDb } from '../firebase/firestore';
import { COLLECTIONS } from '@spartan-g/shared-types';
import { BaseRepository } from '../repositories/base.repository';

export interface AssessmentOverrideDocument {
  assessmentId: string;
  studentId: string;
  maxAttemptsOverride: number;
  grantedBy: string;
  grantedAt: Timestamp;
  reason?: string;
}

class AssessmentOverrideRepository extends BaseRepository<AssessmentOverrideDocument> {
  constructor() {
    super(COLLECTIONS.ASSESSMENT_OVERRIDES);
  }
}

const assessmentOverrideRepository = new AssessmentOverrideRepository();

class AssessmentOverrideService {
  /**
   * Get the effective max attempts for a student on a given assessment.
   * Checks for an override first; falls back to the provided default.
   */
  async getEffectiveMaxAttempts(
    assessmentId: string,
    studentId: string,
    defaultMaxAttempts: number,
  ): Promise<number> {
    try {
      const docId = `${assessmentId}_${studentId}`;
      const override = await assessmentOverrideRepository.getById(docId);
      if (override && override.maxAttemptsOverride > 0) {
        return override.maxAttemptsOverride;
      }
    } catch {
      // Silently fall through to default
    }
    return defaultMaxAttempts;
  }

  /**
   * Get the full override document for a student+assessment pair, if one exists.
   */
  async getOverride(
    assessmentId: string,
    studentId: string,
  ): Promise<(AssessmentOverrideDocument & { id: string }) | null> {
    const docId = `${assessmentId}_${studentId}`;
    try {
      const snapshot = await getDoc(doc(getFirestoreDb(), COLLECTIONS.ASSESSMENT_OVERRIDES, docId));
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...(snapshot.data() as AssessmentOverrideDocument) };
    } catch (error) {
      // Only real Firestore errors (permission, network) should surface
      throw new Error(`Failed to get assessment_overrides/${docId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save (create or update) an override for a student+assessment.
   * Uses read-then-upsert pattern to handle both first-time and subsequent saves.
   */
  async saveOverride(
    assessmentId: string,
    studentId: string,
    maxAttemptsOverride: number,
    grantedBy: string,
    reason?: string,
  ): Promise<void> {
    const docId = `${assessmentId}_${studentId}`;
    const existing = await assessmentOverrideRepository.getById(docId);
    const now = serverTimestamp() as Timestamp;

    if (existing) {
      await assessmentOverrideRepository.update(docId, {
        assessmentId,
        studentId,
        maxAttemptsOverride,
        grantedBy,
        grantedAt: now,
        reason: reason ?? '',
      } as AssessmentOverrideDocument);
    } else {
      await assessmentOverrideRepository.create(docId, {
        assessmentId,
        studentId,
        maxAttemptsOverride,
        grantedBy,
        grantedAt: now,
        reason: reason ?? '',
      } as unknown as AssessmentOverrideDocument);
    }
  }

  /**
   * Remove an override (reverts to assessment default).
   */
  async removeOverride(assessmentId: string, studentId: string): Promise<void> {
    const docId = `${assessmentId}_${studentId}`;
    await assessmentOverrideRepository.delete(docId);
  }
}

export const assessmentOverrideService = new AssessmentOverrideService();