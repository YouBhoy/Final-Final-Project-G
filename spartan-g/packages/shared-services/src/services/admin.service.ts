import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  PERMISSIONS,
  Role,
  PermissionError,
  hasPermission,
  isValidPassword,
  isNonEmptyString,
  AppError,
  profileUpdateAuditAction,
} from '@spartan-g/shared-types';
import type { ProfileDocument, Campus } from '@spartan-g/shared-types';
import { getFirebaseApp } from '../firebase/app';
import { userService } from './user.service';
import { auditService } from './audit.service';

/** Callable Cloud Function names (implemented in firebase/functions). */
const FN_SET_PASSWORD = 'adminSetUserPassword';
const FN_UPDATE_USER = 'adminUpdateUser';

export interface AdminActor {
  actorRole: Role;
  actorUid: string;
  actorEmail?: string | null;
}

export interface SaveUserProfileInput extends AdminActor {
  targetUid: string;
  targetRole: Role;
  campus: Campus;
  profileFields: Partial<ProfileDocument>;
  /** Fields the admin actually changed — recorded in the audit log. */
  changedFields: string[];
}

/**
 * Super Admin operations that require privileged backend execution.
 *
 * The client NEVER holds Admin SDK credentials. Anything that must touch
 * Firebase Authentication for a *different* user (password changes,
 * displayName sync) runs inside a callable Cloud Function that re-verifies
 * the caller's super_admin role with the Admin SDK before acting.
 */
class AdminService {
  /**
   * Edit another user's profile in the SAME users/profiles documents their
   * portal reads (single source of truth — no duplicated profile data).
   * Writes an audit_logs entry describing what changed.
   */
  async saveUserProfile(input: SaveUserProfileInput): Promise<void> {
    this.assertCanManageUsers(input.actorRole);

    if (input.targetUid === input.actorUid) {
      throw new AppError(
        'Use your own profile page to edit your own account',
        'admin/self-edit',
      );
    }

    // Both helpers enforce MANAGE_USERS internally and write through the
    // repositories shared with the Student/Facilitator portals.
    await userService.updateCampus(
      input.actorRole,
      input.targetUid,
      input.campus,
      input.actorUid,
    );
    await userService.updateProfile(
      input.actorRole,
      input.targetUid,
      input.profileFields,
      input.actorUid,
    );

    await auditService.record({
      actorId: input.actorUid,
      actorEmail: input.actorEmail,
      action: profileUpdateAuditAction(input.targetRole),
      resource: 'profiles',
      resourceId: input.targetUid,
      metadata: {
        targetUserId: input.targetUid,
        targetUserRole: input.targetRole,
        changedFields: input.changedFields,
      },
    });
  }

  /**
   * Set another user's Firebase Auth password.
   *
   * Requires the `adminSetUserPassword` Cloud Function. The function — not
   * the client — verifies the caller is an active super_admin, validates
   * the password, applies it with the Admin SDK, and records the audit entry.
   */
  async changeUserPassword(
    input: AdminActor & { targetUid: string; newPassword: string },
  ): Promise<void> {
    this.assertCanManageUsers(input.actorRole);

    if (!isValidPassword(input.newPassword)) {
      throw new AppError('Password must be at least 8 characters', 'admin/weak-password');
    }

    try {
      const fn = httpsCallable<{ targetUid: string; newPassword: string }, { ok: boolean }>(
        getFunctions(getFirebaseApp()),
        FN_SET_PASSWORD,
      );
      await fn({ targetUid: input.targetUid, newPassword: input.newPassword });
    } catch (error) {
      throw mapCallableError(error, 'change the password');
    }
  }

  /**
   * Update a user's display name in BOTH Firebase Auth and their Firestore
   * `users` doc so the name shown in their portal header is consistent.
   * Requires the `adminUpdateUser` Cloud Function.
   */
  async updateAccountDisplayName(
    input: AdminActor & { targetUid: string; targetRole: Role; displayName: string },
  ): Promise<void> {
    this.assertCanManageUsers(input.actorRole);

    if (!isNonEmptyString(input.displayName)) {
      throw new AppError('Display name is required', 'admin/invalid-name');
    }

    try {
      const fn = httpsCallable<{ targetUid: string; displayName: string }, { ok: boolean }>(
        getFunctions(getFirebaseApp()),
        FN_UPDATE_USER,
      );
      await fn({ targetUid: input.targetUid, displayName: input.displayName.trim() });
    } catch (error) {
      throw mapCallableError(error, 'update the account name');
    }
  }

  private assertCanManageUsers(actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_USERS)) {
      throw new PermissionError();
    }
  }
}

/** Translate httpsCallable failures into readable AppErrors. */
function mapCallableError(error: unknown, action: string): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: string }).code)
      : '';
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: string }).message)
      : '';

  if (code === 'functions/not-found' || code === 'functions/internal') {
    return new AppError(
      `Unable to ${action}: the admin backend function is not deployed yet. ` +
        'Deploy firebase/functions first (see docs/super-admin-implementation.md).',
      'admin/function-unavailable',
      error,
    );
  }
  if (code === 'functions/permission-denied') {
    return new PermissionError(
      message || 'Only an active Super Admin can perform this action',
    );
  }
  if (code === 'functions/failed-precondition' || code === 'functions/invalid-argument') {
    return new AppError(message || `Unable to ${action}`, 'admin/invalid-input', error);
  }
  return new AppError(message || `Failed to ${action}`, 'admin/callable-failed', error);
}

export const adminService = new AdminService();
