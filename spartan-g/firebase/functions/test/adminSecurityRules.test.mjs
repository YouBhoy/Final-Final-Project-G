import { test } from 'node:test';
import assert from 'node:assert/strict';

// Unsigned identities are accepted ONLY by the isolated local demo emulator.
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error('A local Firestore emulator is required.');
const project = 'demo-spartan-booking';
process.env.GCLOUD_PROJECT = project;
const database = `projects/${project}/databases/(default)`;
const base = `http://${host}/v1/${database}/documents`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(uid) {
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: project,
    iss: `https://securetoken.google.com/${project}`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    role: 'super_admin', admin: true, firebase: { sign_in_provider: 'custom', identities: {} } })}.`;
}
function value(input) {
  if (typeof input === 'string') return { stringValue: input };
  if (typeof input === 'boolean') return { booleanValue: input };
  return { integerValue: String(input) };
}
async function request(uid, path, options = {}) {
  const result = await fetch(`${base}${path}`, { ...options, headers: { 'Content-Type': 'application/json',
    ...(uid ? { Authorization: `Bearer ${uid === 'owner' ? 'owner' : token(uid)}` } : {}) } });
  return { status: result.status, body: await result.text() };
}
function write(uid, path, data, patch = false) {
  return request(uid, ':commit', { method: 'POST', body: JSON.stringify({ writes: [{
    update: { name: `${database}/documents/${path}`, fields: Object.fromEntries(Object.entries(data).map(([key, input]) => [key, value(input)])) },
    ...(patch ? { updateMask: { fieldPaths: Object.keys(data) } } : {}),
  }] }) });
}
const check = (response, expected) => assert.equal(response.status, expected, response.body);
let sequence = 0;
async function setup() {
  const prefix = `admin_attack_${Date.now()}_${++sequence}`;
  const ids = Object.fromEntries(['admin', 'student', 'facilitator', 'disabled', 'missing'].map(role => [role, `${prefix}_${role}`]));
  for (const role of ['admin', 'student', 'facilitator', 'disabled']) check(await write('owner', `users/${ids[role]}`, {
    uid: ids[role], role: ['admin', 'disabled'].includes(role) ? 'super_admin' : role, isActive: role !== 'disabled',
  }), 200);
  ids.audit = `audit_logs/${prefix}`;
  ids.resource = `resources/${prefix}`;
  ids.campus = `campuses/${prefix}`;
  check(await write('owner', ids.audit, { actorId: ids.admin, action: 'SUPERADMIN_UPDATED_CAMPUS', resource: 'campuses', resourceId: prefix }), 200);
  check(await write('owner', ids.resource, { title: 'Private draft', isActive: false, audience: 'all' }), 200);
  check(await write('owner', ids.campus, { key: prefix, label: 'Inactive synthetic campus', isActive: false }), 200);
  return ids;
}
const attackers = ids => [null, ids.student, ids.facilitator, ids.disabled, ids.missing];

test('direct admin-data reads and collection dumps reject non-admin identities even with forged admin claims', async () => {
  const ids = await setup();
  for (const uid of attackers(ids)) {
    for (const path of [ids.audit, ids.resource, ids.campus, `users/${ids.admin}`]) check(await request(uid, `/${path}`), 403);
    for (const collection of ['users', 'audit_logs', 'resources', 'campuses']) check(await request(uid, `/${collection}`), 403);
  }
  for (const path of [ids.audit, ids.resource, ids.campus]) check(await request(ids.admin, `/${path}`), 200);
});

test('account self-promotion, admin account takeover, and fake admin registration are denied', async () => {
  const ids = await setup();
  for (const uid of attackers(ids)) {
    check(await write(uid, `users/${ids.admin}`, { role: 'student', isActive: false }, true), 403);
    if (uid) check(await write(uid, `users/${uid}`, { role: 'super_admin', isActive: true }, true), 403);
  }
  check(await write(ids.missing, `users/${ids.missing}`, { uid: ids.missing, role: 'super_admin', isActive: true }), 403);
});

test('non-admin clients cannot change campus settings, resources, privacy policy or assessment overrides', async () => {
  const ids = await setup();
  for (const uid of attackers(ids)) {
    for (const path of [ids.campus, ids.resource, 'platform_settings/privacy_policy', `assessment_overrides/${ids.student}`]) {
      check(await write(uid, path, { title: 'Forged admin change', isActive: true }, true), 403);
    }
  }
  check(await write(ids.admin, ids.campus, { label: 'Legitimate admin edit' }, true), 200);
});

test('audit trail rejects forged actors, non-admin appends, updates and deletion', async () => {
  const ids = await setup();
  for (const uid of attackers(ids)) check(await write(uid, `${ids.audit}_fake`, { actorId: ids.admin, action: 'SUPERADMIN_UPDATED_CAMPUS', resource: 'campuses' }), 403);
  check(await write(ids.admin, `${ids.audit}_forged_actor`, { actorId: ids.student, action: 'SUPERADMIN_UPDATED_CAMPUS', resource: 'campuses' }), 403);
  check(await write(ids.admin, ids.audit, { action: 'FORGED' }, true), 403);
  check(await request(ids.admin, `/${ids.audit}`, { method: 'DELETE' }), 403);
});

test('deactivation or demotion revokes server permissions with the same existing token', async () => {
  const ids = await setup();
  check(await request(ids.admin, `/${ids.audit}`), 200);
  check(await write('owner', `users/${ids.admin}`, { isActive: false }, true), 200);
  check(await request(ids.admin, `/${ids.audit}`), 403);
  check(await write('owner', `users/${ids.admin}`, { isActive: true, role: 'student' }, true), 200);
  check(await request(ids.admin, `/${ids.audit}`), 403);
});

test('students and facilitators cannot inject notifications into the admin inbox', async () => {
  const ids = await setup();
  for (const uid of attackers(ids)) check(await write(uid, `notifications/${ids.admin}_${uid ?? 'anonymous'}`, {
    userId: ids.admin, title: 'Forged security alert', body: 'Synthetic attack', type: 'alert', isRead: false,
  }), 403);
  check(await write(ids.admin, `notifications/${ids.admin}_trusted`, { userId: ids.admin, title: 'Trusted', isRead: false }), 200);
});

test('notification owners cannot transfer messages into an admin inbox or rewrite their contents', async () => {
  const ids = await setup(), path = `notifications/${ids.student}_own`;
  check(await write('owner', path, { userId: ids.student, title: 'Original notification', isRead: false }), 200);
  check(await write(ids.student, path, { userId: ids.admin }, true), 403);
  check(await write(ids.student, path, { title: 'Forged security alert' }, true), 403);
  check(await write(ids.student, path, { isRead: true }, true), 200);
});

test('legitimate student/facilitator notifications and admin read receipts still work', async () => {
  const ids = await setup();
  check(await write('owner', `facilitator_student_links/${ids.facilitator}_${ids.student}`, { studentId: ids.student, facilitatorId: ids.facilitator, status: 'accepted' }), 200);
  for (const [sender, recipient] of [[ids.student, ids.facilitator], [ids.facilitator, ids.student], [ids.admin, ids.admin]]) {
    const path = `notifications/${sender}_${recipient}`;
    check(await write(sender, path, { userId: recipient, title: 'Synthetic appointment update', type: 'appointment', isRead: false }), 200);
    check(await write(recipient, path, { isRead: true }, true), 200);
  }
});

test('every privileged callable rejects anonymous users and forged admin claims before performing any operation', async () => {
  const { adminSetUserPassword, adminUpdateUser } = await import('../lib/adminUserFunctions.js');
  const { handleAdminUpdateStudentProfile } = await import('../lib/adminStudentProfile.js');
  const { handleSuperAdminOverrideAttempts } = await import('../lib/assessmentOverride.js');
  const ids = await setup();
  const handlers = [request => adminSetUserPassword.run(request), request => adminUpdateUser.run(request), handleAdminUpdateStudentProfile, handleSuperAdminOverrideAttempts];
  for (const uid of attackers(ids)) {
    for (const handler of handlers) {
      await assert.rejects(handler({ auth: uid ? { uid, token: { role: 'super_admin', admin: true } } : undefined,
        data: { targetUid: ids.student, role: 'super_admin', isActive: true } }), { code: uid ? 'permission-denied' : 'unauthenticated' });
    }
  }
});
