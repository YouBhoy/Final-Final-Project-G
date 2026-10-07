import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Tests require the Firestore emulator; never run against live data.');
process.env.GCLOUD_PROJECT = 'demo-spartan-booking';
// The module under test initializes the default admin app on import.
const { handleAdminUpdateStudentProfile } = await import('../lib/adminStudentProfile.js');
const db = getFirestore();

let sequence = 0;
const ts = () => new Date();
async function setup() {
  const id = `prof_${Date.now()}_${++sequence}`;
  const ids = { admin: `${id}_admin`, student: `${id}_student`, other: `${id}_other`, fac: `${id}_fac`, inactiveAdmin: `${id}_iadmin` };
  await Promise.all([
    db.doc(`users/${ids.admin}`).set({ role: 'super_admin', isActive: true, email: 'a@x.com' }),
    db.doc(`users/${ids.inactiveAdmin}`).set({ role: 'super_admin', isActive: false }),
    db.doc(`users/${ids.student}`).set({ role: 'student', isActive: true, email: 's@x.com', campus: 'lipa', displayName: 'S', createdAt: ts() }),
    db.doc(`users/${ids.other}`).set({ role: 'student', isActive: true, email: 'o@x.com', campus: 'lipa' }),
    db.doc(`users/${ids.fac}`).set({ role: 'facilitator', isActive: true, email: 'f@x.com', campus: 'lipa' }),
    db.doc(`profiles/${ids.student}`).set({ uid: ids.student, campus: 'lipa', bio: 'old bio' }),
  ]);
  return ids;
}
const call = (uid, data) => handleAdminUpdateStudentProfile({ auth: uid ? { uid, token: {} } : undefined, data });
const good = (targetUid, extra = {}) => ({ targetUid, campus: 'alangilan', bio: 'New bio', pronouns: 'they/them', gender: 'non_binary',
  phone: '+63 912 345 6789', institution: 'BatStateU', ...extra });

// ─── Callable (adminUpdateStudentProfile) ─────────────────────────
test('super admin can edit all allowed profile fields; users + profiles + audit are written', async () => {
  const ids = await setup();
  const result = await call(ids.admin, good(ids.student));
  assert.deepEqual([...result.changedFields].sort(), ['bio', 'campus', 'gender', 'institution', 'phone', 'pronouns']);
  const profile = (await db.doc(`profiles/${ids.student}`).get()).data();
  assert.equal(profile.bio, 'New bio');
  assert.equal(profile.campus, 'alangilan');
  assert.equal(profile.gender, 'non_binary');
  assert.equal(profile.updatedBy, ids.admin);
  const user = (await db.doc(`users/${ids.student}`).get()).data();
  assert.equal(user.campus, 'alangilan');
  assert.equal(user.updatedBy, ids.admin);
  assert.equal(user.role, 'student');
  assert.equal(user.email, 's@x.com');
  const audit = await db.collection('audit_logs').where('resourceId', '==', ids.student).get();
  assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].data().action, 'SUPERADMIN_UPDATED_STUDENT_PROFILE');
  assert.equal(audit.docs[0].data().actorId, ids.admin);
});

test('role, email, status and uid are rejected, and nothing is written', async () => {
  const ids = await setup();
  for (const extra of [{ role: 'super_admin' }, { email: 'evil@x.com' }, { isActive: false }, { uid: 'someone-else' }, { displayName: 'X' }]) {
    await assert.rejects(call(ids.admin, good(ids.student, extra)), { code: 'invalid-argument' });
  }
  const user = (await db.doc(`users/${ids.student}`).get()).data();
  assert.equal(user.role, 'student');
  assert.equal(user.email, 's@x.com');
  assert.equal(user.isActive, true);
  assert.equal(user.campus, 'lipa');
  assert.equal((await db.doc(`profiles/${ids.student}`).get()).data().bio, 'old bio');
});

test('only an active super admin may call it', async () => {
  const ids = await setup();
  await assert.rejects(call(undefined, good(ids.student)), { code: 'unauthenticated' });
  for (const uid of [ids.fac, ids.student, ids.other, ids.inactiveAdmin]) {
    await assert.rejects(call(uid, good(ids.student)), { code: 'permission-denied' });
  }
  assert.equal((await db.doc(`profiles/${ids.student}`).get()).data().bio, 'old bio');
});

test('it only applies to student accounts', async () => {
  const ids = await setup();
  await assert.rejects(call(ids.admin, good(ids.fac)), { code: 'failed-precondition' });
  await assert.rejects(call(ids.admin, good(ids.admin)), { code: 'failed-precondition' });
  await assert.rejects(call(ids.admin, good('does-not-exist')), { code: 'failed-precondition' });
});

test('validation: campus, gender, phone and length limits', async () => {
  const ids = await setup();
  const bad = [
    { campus: '' }, { campus: 'atlantis' }, { gender: 'robot' }, { phone: 'call me' }, { phone: '12' },
    { bio: 'x'.repeat(1001) }, { pronouns: 'x'.repeat(51) }, { institution: 'x'.repeat(151) }, { bio: 42 },
  ];
  for (const extra of bad) await assert.rejects(call(ids.admin, good(ids.student, extra)), { code: 'invalid-argument' });
  await assert.rejects(call(ids.admin, { ...good(ids.student), targetUid: 'a/b' }), { code: 'invalid-argument' });
});

test('empty optional fields are allowed, and custom active campuses are accepted', async () => {
  const ids = await setup();
  await db.doc('campuses/custom1').set({ key: 'new_campus', label: 'New', isActive: true });
  await db.doc('campuses/custom2').set({ key: 'closed_campus', label: 'Closed', isActive: false });
  await call(ids.admin, { targetUid: ids.student, campus: 'new_campus' });
  const profile = (await db.doc(`profiles/${ids.student}`).get()).data();
  assert.equal(profile.campus, 'new_campus');
  assert.equal(profile.bio, '');
  assert.equal(profile.gender, undefined);
  await assert.rejects(call(ids.admin, { targetUid: ids.student, campus: 'closed_campus' }), { code: 'invalid-argument' });
});

test('an unchanged payload writes and audits nothing', async () => {
  const ids = await setup();
  await call(ids.admin, good(ids.student));
  const before = (await db.collection('audit_logs').where('resourceId', '==', ids.student).get()).size;
  const result = await call(ids.admin, good(ids.student));
  assert.deepEqual(result.changedFields, []);
  assert.equal((await db.collection('audit_logs').where('resourceId', '==', ids.student).get()).size, before);
});

// ─── Firestore rules (REST, unsigned emulator tokens) ─────────────
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
  sub: uid, user_id: uid, aud: 'demo-spartan-booking', iss: 'https://securetoken.google.com/demo-spartan-booking',
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  firebase: { sign_in_provider: 'custom', identities: {} },
})}.`;
const docUrl = (path, fields) => `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-spartan-booking/databases/(default)/documents/${path}`
  + (fields ? `?${Object.keys(fields).map(key => `updateMask.fieldPaths=${key}`).join('&')}` : '');
const patch = (uid, path, fields) => fetch(docUrl(path, fields), { method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(uid)}` }, body: JSON.stringify({ fields }) }).then(r => r.status);
const str = value => ({ stringValue: value });

test('rules: a student can no longer change any profile field on users or profiles', async () => {
  const ids = await setup();
  for (const fields of [{ campus: str('alangilan') }, { displayName: str('Hacker') }, { photoURL: str('http://x/y.png') }, { bio: str('x') }]) {
    assert.equal(await patch(ids.student, `users/${ids.student}`, fields), 403, JSON.stringify(fields));
  }
  for (const fields of [{ bio: str('x') }, { phone: str('123456') }, { pronouns: str('x') }, { gender: str('male') },
    { institution: str('x') }, { campus: str('alangilan') }, { avatarUrl: str('http://x/y.png') }]) {
    assert.equal(await patch(ids.student, `profiles/${ids.student}`, fields), 403, JSON.stringify(fields));
  }
  assert.equal((await db.doc(`profiles/${ids.student}`).get()).data().bio, 'old bio');
});

test('rules: a student cannot change role, status, email or uid', async () => {
  const ids = await setup();
  for (const fields of [{ role: str('super_admin') }, { role: str('facilitator') }, { isActive: { booleanValue: false } },
    { email: str('evil@x.com') }, { uid: str('someone-else') }]) {
    assert.equal(await patch(ids.student, `users/${ids.student}`, fields), 403, JSON.stringify(fields));
  }
  const user = (await db.doc(`users/${ids.student}`).get()).data();
  assert.equal(user.role, 'student');
  assert.equal(user.email, 's@x.com');
});

test('rules: a student can still write updatedAt (the only system key the app writes) and register a {uid, campus} profile', async () => {
  const ids = await setup();
  assert.equal(await patch(ids.student, `users/${ids.student}`, { updatedAt: { timestampValue: new Date().toISOString() } }), 200);
  // Registration: the profile doc does not exist yet.
  await db.doc(`profiles/${ids.other}`).delete().catch(() => {});
  assert.equal(await patch(ids.other, `profiles/${ids.other}`, { uid: str(ids.other), campus: str('lipa'),
    createdAt: { timestampValue: new Date().toISOString() }, updatedAt: { timestampValue: new Date().toISOString() } }), 200);
  // ...but not with extra profile fields.
  await db.doc(`profiles/${ids.other}`).delete();
  assert.equal(await patch(ids.other, `profiles/${ids.other}`, { uid: str(ids.other), campus: str('lipa'), bio: str('sneaky') }), 403);
});

test('rules: a facilitator cannot edit a student\'s profile but can still edit their own', async () => {
  const ids = await setup();
  assert.equal(await patch(ids.fac, `users/${ids.student}`, { campus: str('alangilan') }), 403);
  assert.equal(await patch(ids.fac, `profiles/${ids.student}`, { bio: str('x') }), 403);
  assert.equal(await patch(ids.fac, `users/${ids.fac}`, { campus: str('alangilan') }), 200);
  assert.equal(await patch(ids.fac, `users/${ids.fac}`, { role: str('super_admin') }), 403);
  assert.equal(await patch(ids.fac, `profiles/${ids.fac}`, { bio: str('about me') }), 200);
});

test('rules: another student cannot edit this student\'s profile', async () => {
  const ids = await setup();
  assert.equal(await patch(ids.other, `users/${ids.student}`, { campus: str('alangilan') }), 403);
  assert.equal(await patch(ids.other, `profiles/${ids.student}`, { bio: str('x') }), 403);
});

test('rules: a super admin may still manage profiles directly (existing behaviour kept)', async () => {
  const ids = await setup();
  assert.equal(await patch(ids.admin, `profiles/${ids.student}`, { bio: str('admin edit') }), 200);
  assert.equal(await patch(ids.admin, `users/${ids.student}`, { campus: str('alangilan') }), 200);
});
