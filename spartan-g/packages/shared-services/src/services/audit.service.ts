import {
  AUDIT_ACTIONS,
  AuditLogDocument,
  AppError,
  type AuditAction,
} from '@spartan-g/shared-types';
import { auditLogRepository } from '../repositories/audit-log.repository';

export interface AuditEntry {
  /** UID of the actor performing the action (must equal request.auth.uid — enforced by rules). */
  actorId: string;
  /** Email of the actor, stored in metadata for readability. */
  actorEmail?: string | null;
  /** e.g. SUPERADMIN_UPDATED_STUDENT_PROFILE (see AUDIT_ACTIONS). */
  action: string;
  /** Collection the action targeted, e.g. 'profiles', 'auth', 'resources'. */
  resource: string;
  /** Target document id (user uid or resource id). */
  resourceId: string;
  /** Extra context: targetUserId, targetUserRole, changedFields, resourceName, … */
  metadata?: Record<string, unknown>;
}

/**
 * Writes entries to the existing `audit_logs` collection (the project's
 * single audit trail — extend it, never create a second one).
 *
 * Firestore rules allow create only for facilitators/super admins and bind
 * `actorId == request.auth.uid`, and entries are immutable (update/delete
 * are denied for everyone, including super admins).
 */
class AuditService {
  async record(entry: AuditEntry): Promise<void> {
    if (!entry.actorId) {
      throw new AppError('Audit entries require an actorId', 'audit/missing-actor');
    }
    if (!Object.values(AUDIT_ACTIONS).includes(entry.action as AuditAction)) {
      throw new AppError('Audit action is not recognized', 'audit/invalid-action');
    }
    if (!['profiles', 'users', 'auth', 'resources'].includes(entry.resource)) {
      throw new AppError('Audit resource is not recognized', 'audit/invalid-resource');
    }
    const doc: Omit<AuditLogDocument, 'id' | 'createdAt' | 'updatedAt'> = {
      actorId: entry.actorId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      metadata: {
        ...(entry.metadata ?? {}),
        ...(entry.actorEmail ? { adminEmail: entry.actorEmail } : {}),
        recordedAt: new Date().toISOString(),
      },
    };

    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await auditLogRepository.create(id, doc as AuditLogDocument);
  }

  /** Recent entries — callers must already be Super Admin (rules enforce read). */
  async listRecent(max = 100) {
    return auditLogRepository.getRecent(max);
  }
}

export const auditService = new AuditService();
