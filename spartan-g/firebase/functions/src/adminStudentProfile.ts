import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { requireSuperAdmin, writeAuditEntry } from './adminUserFunctions.js';

if (!admin.apps.length) admin.initializeApp();

const GENDERS = ['male', 'female', 'non_binary', 'other', 'prefer_not_to_say'] as const;
/** Built-in campus keys (mirrors ALL_CAMPUSES in shared-types). Super admins may add more in `campuses`. */
const BUILT_IN_CAMPUSES = ['pablo_borbon', 'alangilan', 'arasof_nasugbu', 'jplpc_malvar', 'lipa'];
const LIMITS = { bio: 1000, pronouns: 50, institution: 150, campus: 64 } as const;
/** Optional leading +, then 6-20 digits, spaces, dots, dashes or parentheses. */
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{5,19}$/;
const ALLOWED_KEYS = ['targetUid', 'campus', 'bio', 'phone', 'institution', 'pronouns', 'gender'];
const PROFILE_FIELDS = ['campus', 'bio', 'phone', 'institution', 'pronouns', 'gender'] as const;

function text(data: Record<string, unknown>, key: string, max: number): string {
  const value = data[key];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${key} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new HttpsError('invalid-argument', `${key} must be at most ${max} characters.`);
  }
  return trimmed;
}

/**
 * Handler for adminUpdateStudentProfile, exported separately so it can be
 * exercised against the emulator. Only the student profile fields below can be
 * written; role, email, isActive and uid are never accepted.
 */
export async function handleAdminUpdateStudentProfile(request: Pick<CallableRequest, 'auth' | 'data'>) {
  const caller = await requireSuperAdmin(request);
  const data = (request.data ?? {}) as Record<string, unknown>;

  const unexpected = Object.keys(data).filter((key) => !ALLOWED_KEYS.includes(key));
  if (unexpected.length > 0) {
    throw new HttpsError('invalid-argument', `Fields cannot be edited here: ${unexpected.join(', ')}.`);
  }

  const targetUid = data.targetUid;
  if (typeof targetUid !== 'string' || !targetUid || targetUid.includes('/')) {
    throw new HttpsError('invalid-argument', 'A target student id is required.');
  }

  const next = {
    campus: text(data, 'campus', LIMITS.campus),
    bio: text(data, 'bio', LIMITS.bio),
    pronouns: text(data, 'pronouns', LIMITS.pronouns),
    institution: text(data, 'institution', LIMITS.institution),
    phone: text(data, 'phone', 20),
    gender: text(data, 'gender', 32),
  };
  if (!next.campus) throw new HttpsError('invalid-argument', 'A campus is required.');
  if (next.phone && !PHONE_PATTERN.test(next.phone)) {
    throw new HttpsError('invalid-argument', 'Enter a valid phone number (6-20 digits, optional +).');
  }
  if (next.gender && !(GENDERS as readonly string[]).includes(next.gender)) {
    throw new HttpsError('invalid-argument', 'Choose a valid gender option.');
  }

  const db = admin.firestore();
  if (!BUILT_IN_CAMPUSES.includes(next.campus)) {
    const custom = await db.collection('campuses').where('key', '==', next.campus).where('isActive', '==', true).limit(1).get();
    if (custom.empty) throw new HttpsError('invalid-argument', 'Choose a valid, active campus.');
  }

  const userRef = db.doc(`users/${targetUid}`);
  const profileRef = db.doc(`profiles/${targetUid}`);
  const [userSnap, profileSnap] = await Promise.all([userRef.get(), profileRef.get()]);
  if (!userSnap.exists) throw new HttpsError('failed-precondition', 'Student not found.');
  if (userSnap.data()?.role !== 'student') {
    throw new HttpsError('failed-precondition', 'Only student profiles can be edited here.');
  }

  const before = profileSnap.data() ?? {};
  const previous: Record<string, string> = {
    campus: before.campus ?? userSnap.data()?.campus ?? '',
    bio: before.bio ?? '',
    phone: before.phone ?? '',
    institution: before.institution ?? '',
    pronouns: before.pronouns ?? '',
    gender: before.gender ?? '',
  };
  const changedFields = PROFILE_FIELDS.filter((field) => next[field] !== previous[field]);
  if (changedFields.length === 0) return { ok: true, changedFields: [] as string[] };

  const stamp = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
  };
  const batch = db.batch();
  batch.update(userRef, { campus: next.campus, ...stamp });
  batch.set(
    profileRef,
    {
      uid: targetUid,
      campus: next.campus,
      bio: next.bio,
      phone: next.phone,
      institution: next.institution,
      pronouns: next.pronouns,
      gender: next.gender || admin.firestore.FieldValue.delete(),
      ...stamp,
    },
    { merge: true },
  );
  await batch.commit();

  await writeAuditEntry({
    actorId: caller.uid,
    actorEmail: caller.email,
    action: 'SUPERADMIN_UPDATED_STUDENT_PROFILE',
    resource: 'profiles',
    resourceId: targetUid,
    metadata: { targetUserId: targetUid, targetUserRole: 'student', changedFields },
  });

  return { ok: true, changedFields: [...changedFields] };
}

/**
 * adminUpdateStudentProfile — super-admin edit of a student's profile fields.
 *
 * Callable (not a client rule) so the caller's role, the target's role and
 * every value are validated server-side in one place, the write is limited to
 * the profile fields, and the change is audited atomically with the request.
 */
export const adminUpdateStudentProfile = onCall(
  { region: 'us-central1', cors: true },
  (request) => handleAdminUpdateStudentProfile(request),
);
