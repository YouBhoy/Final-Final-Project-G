import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

if (!admin.apps.length) {
  admin.initializeApp();
}

const ROLES_COLLECTION = 'users';

interface CallerContext {
  auth?: { uid: string; token: { email?: string; [k: string]: unknown } };
}

/**
 * Server-side authorization: NEVER trust the client's claim of being an
 * admin. Read the caller's `users/{uid}` doc with the Admin SDK and require
 * an active super_admin role.
 */
async function requireSuperAdmin(context: CallerContext) {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const snap = await admin.firestore().doc(`${ROLES_COLLECTION}/${uid}`).get();
  const data = snap.data();

  if (!snap.exists || data?.role !== 'super_admin' || data?.isActive !== true) {
    throw new HttpsError(
      'permission-denied',
      'Only an active Super Admin may perform this action.',
    );
  }

  return { uid, email: context.auth?.token?.email ?? null };
}

async function requireExistingTarget(targetUid: string) {
  if (!targetUid || typeof targetUid !== 'string') {
    throw new HttpsError('invalid-argument', 'A target user id is required.');
  }
  try {
    const target = await admin.auth().getUser(targetUid);
    const targetDoc = await admin.firestore().doc(`${ROLES_COLLECTION}/${targetUid}`).get();
    return {
      target,
      role: (targetDoc.data()?.role as string | undefined) ?? null,
      isActive: (targetDoc.data()?.isActive as boolean | undefined) ?? false,
    };
  } catch {
    throw new HttpsError('not-found', 'Target user account not found.');
  }
}

async function writeAuditEntry(entry: {
  actorId: string;
  actorEmail: string | null;
  action: string;
  resource: string;
  resourceId: string;
  metadata: Record<string, unknown>;
}) {
  const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await admin.firestore().collection('audit_logs').doc(id).set({
    actorId: entry.actorId,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    metadata: {
      ...entry.metadata,
      adminEmail: entry.actorEmail,
      recordedAt: new Date().toISOString(),
      source: 'cloud_function',
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * adminSetUserPassword — set another user's Firebase Auth password.
 *
 * Runs entirely on the backend with the Admin SDK. The caller must be an
 * active super_admin (verified server-side). No privileged credentials are
 * ever shipped to the browser. The password itself is never logged.
 */
export const adminSetUserPassword = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    const caller = await requireSuperAdmin(request);

    const { targetUid, newPassword } = (request.data ?? {}) as {
      targetUid?: unknown;
      newPassword?: unknown;
    };

    if (typeof targetUid !== 'string' || !targetUid) {
      throw new HttpsError('invalid-argument', 'A target user id is required.');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new HttpsError('invalid-argument', 'Password must be at least 8 characters.');
    }
    if (targetUid === caller.uid) {
      throw new HttpsError(
        'failed-precondition',
        'Use your own profile settings to change your own password.',
      );
    }

    const { role } = await requireExistingTarget(targetUid);

    await admin.auth().updateUser(targetUid, { password: newPassword });

    await writeAuditEntry({
      actorId: caller.uid,
      actorEmail: caller.email,
      action: 'SUPERADMIN_CHANGED_PASSWORD',
      resource: 'auth',
      resourceId: targetUid,
      metadata: { targetUserId: targetUid, targetUserRole: role },
    });

    return { ok: true };
  },
);

/**
 * adminUpdateUser — update account-level fields that live in Firebase Auth
 * as well as Firestore (currently: displayName), so the user's portal header
 * and their Firestore users doc stay consistent.
 */
export const adminUpdateUser = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    const caller = await requireSuperAdmin(request);

    const { targetUid, displayName } = (request.data ?? {}) as {
      targetUid?: unknown;
      displayName?: unknown;
    };

    if (typeof targetUid !== 'string' || !targetUid) {
      throw new HttpsError('invalid-argument', 'A target user id is required.');
    }
    if (typeof displayName !== 'string' || !displayName.trim()) {
      throw new HttpsError('invalid-argument', 'Display name is required.');
    }
    if (targetUid === caller.uid) {
      throw new HttpsError(
        'failed-precondition',
        'Use your own profile page to change your own name.',
      );
    }

    const { role } = await requireExistingTarget(targetUid);
    const trimmed = displayName.trim().slice(0, 100);

    // 1. Firebase Auth — what the portal header renders.
    await admin.auth().updateUser(targetUid, { displayName: trimmed });

    // 2. Firestore users doc — the single source of truth for profiles.
    await admin.firestore().doc(`${ROLES_COLLECTION}/${targetUid}`).update({
      displayName: trimmed,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await writeAuditEntry({
      actorId: caller.uid,
      actorEmail: caller.email,
      action: 'SUPERADMIN_UPDATED_ACCOUNT_NAME',
      resource: 'users',
      resourceId: targetUid,
      metadata: {
        targetUserId: targetUid,
        targetUserRole: role,
        changedFields: ['displayName'],
        displayName: trimmed,
      },
    });

    return { ok: true };
  },
);
