import { test } from 'node:test';
import assert from 'node:assert/strict';

// Only unsigned emulator tokens and a demo project are used. Never run on live data.
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) {
  throw new Error('Registration rule tests require a local Firestore emulator.');
}
const project = 'demo-spartan-booking';
const database = `projects/${project}/databases/(default)`;
const base = `http://${host}/v1/${database}/documents`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
  sub: uid, user_id: uid, aud: project,
  iss: `https://securetoken.google.com/${project}`,
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  firebase: { sign_in_provider: 'custom', identities: {} },
})}.`;
let sequence = 0;
const unique = () => `signup_${Date.now()}_${++sequence}`;
const str = value => ({ stringValue: value });
const fieldsFor = uid => ({
  uid: str(uid), email: str('student@example.com'), displayName: str('Student'),
  role: str('student'), campus: str('lipa'), isActive: { booleanValue: true },
});
async function write(caller, uid, fields, { serverTime = true } = {}) {
  const response = await fetch(`${base}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      ...(caller ? { Authorization: `Bearer ${caller === 'owner' ? 'owner' : token(caller)}` } : {}) },
    body: JSON.stringify({ writes: [{
      update: { name: `${database}/documents/users/${uid}`, fields },
      ...(serverTime ? { updateTransforms: ['createdAt', 'updatedAt'].map(fieldPath => ({
        fieldPath, setToServerValue: 'REQUEST_TIME',
      })) } : {}),
    }] }),
  });
  const body = await response.text();
  return { status: response.status, body };
}
const check = (result, expected) => assert.equal(result.status, expected, result.body);

test('public student registration succeeds with server timestamps', async () => {
  const uid = unique();
  check(await write(uid, uid, fieldsFor(uid)), 200);
});

test('direct self-registration cannot grant facilitator or super-admin roles', async () => {
  for (const role of ['facilitator', 'super_admin']) {
    for (const active of [true, false]) {
      const uid = unique();
      check(await write(uid, uid, { ...fieldsFor(uid), role: str(role), isActive: { booleanValue: active } }), 403);
    }
  }
});

test('anonymous and cross-user registration are denied', async () => {
  const uid = unique();
  check(await write(null, uid, fieldsFor(uid)), 403);
  check(await write(unique(), uid, fieldsFor(uid)), 403);
});

test('registration rejects spoofed uid, extra privilege fields and malformed required fields', async () => {
  for (const changes of [
    { uid: str('someone-else') }, { permissions: { arrayValue: { values: [str('admin')] } } },
    { campus: str('') }, { email: { integerValue: '123' } }, { isActive: { booleanValue: false } },
  ]) {
    const uid = unique();
    check(await write(uid, uid, { ...fieldsFor(uid), ...changes }), 403);
  }
  const uid = unique();
  const fields = fieldsFor(uid);
  delete fields.displayName;
  check(await write(uid, uid, fields), 403);
});

test('registration requires server timestamps', async () => {
  const uid = unique();
  check(await write(uid, uid, fieldsFor(uid), { serverTime: false }), 403);
  const old = { timestampValue: '2020-01-01T00:00:00Z' };
  check(await write(uid, uid, { ...fieldsFor(uid), createdAt: old, updatedAt: old }, { serverTime: false }), 403);
});

test('registered students cannot promote themselves or change activation', async () => {
  const uid = unique();
  check(await write(uid, uid, fieldsFor(uid)), 200);
  for (const fields of [{ role: str('facilitator') }, { role: str('super_admin') }, { isActive: { booleanValue: false } }]) {
    const response = await fetch(`${base}/users/${uid}?${Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&')}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(uid)}` },
      body: JSON.stringify({ fields }),
    });
    assert.equal(response.status, 403, await response.text());
  }
});

test('existing active super admins can still provision facilitator accounts', async () => {
  const admin = unique();
  check(await write('owner', admin, { ...fieldsFor(admin), role: str('super_admin') }), 200);
  const uid = unique();
  check(await write(admin, uid, { ...fieldsFor(uid), role: str('facilitator') }), 200);
  // Existing staff can read their own account; signup restrictions do not revoke staff access.
  const response = await fetch(`${base}/users/${uid}`, { headers: { Authorization: `Bearer ${token(uid)}` } });
  assert.equal(response.status, 200, await response.text());
});

test('disabled admins and existing facilitators cannot provision staff accounts', async () => {
  for (const [role, active] of [['super_admin', false], ['facilitator', true]]) {
    const caller = unique();
    check(await write('owner', caller, { ...fieldsFor(caller), role: str(role), isActive: { booleanValue: active } }), 200);
    const uid = unique();
    check(await write(caller, uid, { ...fieldsFor(uid), role: str('facilitator') }), 403);
  }
});
