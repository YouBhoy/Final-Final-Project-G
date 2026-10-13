import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes } from 'firebase/storage';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
for (const address of [host, storageHost]) {
  if (!address || !/^(localhost|127\.0\.0\.1):\d+$/.test(address)) throw new Error('Local Firestore and Storage emulators required.');
}
const project = 'demo-spartan-booking';
const database = `projects/${project}/databases/(default)`;
const base = `http://${host}/v1/${database}/documents`;
const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid,
  aud: project, iss: `https://securetoken.google.com/${project}`, iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000)+3600, firebase: { sign_in_provider: 'custom', identities: {} } })}.`;
function value(v) {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { integerValue: String(v) };
}
async function write(uid, path, data, patch = false, times = []) {
  const response = await fetch(`${base}:commit`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid === 'owner' ? 'owner' : token(uid)}` },
    body: JSON.stringify({ writes: [{ update: { name: `${database}/documents/${path}`,
      fields: Object.fromEntries(Object.entries(data).map(([k,v]) => [k,value(v)])) },
      ...(patch ? { updateMask: { fieldPaths: Object.keys(data) } } : {}),
      ...(times.length ? { updateTransforms: times.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) } : {})
    }] }) });
  const body = await response.text();
  return { status: response.status, body };
}
const check = (r, code) => assert.equal(r.status, code, r.body);
let sequence = 0;
async function setup() {
  const prefix = `security_${Date.now()}_${++sequence}`;
  const ids = Object.fromEntries(['student','facilitator','outsider','disabled','admin'].map(k => [k,`${prefix}_${k}`]));
  for (const [key,uid] of Object.entries(ids)) check(await write('owner',`users/${uid}`, {
    role: key === 'admin' ? 'super_admin' : key === 'facilitator' ? 'facilitator' : 'student', isActive: key !== 'disabled'
  }),200);
  ids.conversation = `${prefix}_conversation`;
  check(await write('owner',`conversations/${ids.conversation}`, { participantIds: [ids.student, ids.facilitator] }),200);
  return ids;
}
test('message create permits participants and rejects outsiders, inactive accounts, forged senders and invalid bodies', async () => {
  const ids = await setup();
  const data = { senderId: ids.student, conversationId: ids.conversation, body: 'Synthetic message' };
  const send = (uid,changes = {},times = ['createdAt','updatedAt']) => write(uid,`messages/${ids.conversation}_${++sequence}`,{ ...data,...changes },false,times);
  check(await send(ids.student),200);
  check(await send(ids.facilitator,{ senderId: ids.facilitator }),200);
  for (const uid of [ids.outsider,ids.disabled]) check(await send(uid,{ senderId: uid }),403);
  check(await send(ids.student,{ senderId: ids.facilitator }),403);
  check(await send(ids.student,{ conversationId: 'missing' }),403);
  for (const body of ['', 'x'.repeat(4001), 123]) check(await send(ids.student,{ body }),403);
  check(await send(ids.student,{},[]),403);
});
test('device tokens cannot be taken over or rewritten by inactive users', async () => {
  const ids = await setup(), path = `device_tokens/${ids.student}_web`;
  check(await write(ids.student,path,{ uid: ids.student, token: 'synthetic-token' }),200);
  check(await write(ids.outsider,path,{ uid: ids.outsider, token: 'replacement' }),403);
  check(await write(ids.student,path,{ token: 'own-replacement' },true),200);
  check(await write('owner',`users/${ids.student}`,{ isActive: false },true),200);
  check(await write(ids.student,path,{ token: 'disabled-replacement' },true),403);
});
test('schedule ownership is immutable while own schedule edits still work', async () => {
  const ids = await setup(),path = `work_hours_schedules/${ids.facilitator}`;
  check(await write(ids.facilitator,path,{ facilitatorId: ids.facilitator, dayOfWeek: 1 }),200);
  check(await write(ids.facilitator,path,{ dayOfWeek: 2 },true),200);
  check(await write(ids.facilitator,path,{ facilitatorId: ids.outsider },true),403);
});
// These tests record residual weaknesses; a passing test here means the gap is
// reproduced, not that the behavior is secure. Invert assertions with the migration.
test('OPEN SEC-003: an unrelated student can read an active appointment including notes', async () => {
  const ids = await setup(), path = `appointments/${ids.conversation}`;
  check(await write('owner',path,{ studentId: ids.student, facilitatorId: ids.facilitator,
    status: 'requested', notes: 'Synthetic private appointment note' }),200);
  const response = await fetch(`${base}/${path}`,{ headers: { Authorization: `Bearer ${token(ids.outsider)}` } });
  assert.equal(response.status,200);
  assert.equal((await response.json()).fields.notes.stringValue,'Synthetic private appointment note');
});
test('OPEN SEC-004: students can supply their own risk classification on submission', async () => {
  const ids = await setup(), path = `assessment_attempts/${ids.conversation}`;
  check(await write('owner',path,{ studentId: ids.student, assessmentId: 'synthetic', status: 'in_progress', attemptNumber: 1 }),200);
  check(await write(ids.student,path,{ status: 'submitted', overallRiskLevel: 'low', overallRiskScore: 0 },true),200);
});
test('OPEN SEC-005: an authenticated outsider can create a notification for another user', async () => {
  const ids = await setup();
  check(await write(ids.outsider,`notifications/${ids.conversation}`,{ userId: ids.student,
    title: 'Synthetic spoofed notification', body: 'Synthetic', type: 'message' }),200);
});
test('OPEN SEC-006: slot reservation permits unrelated identity and time changes', async () => {
  const ids = await setup(), path = `appointment_slots/${ids.conversation}`;
  check(await write('owner',path,{ facilitatorId: ids.facilitator, status: 'available', startTime: 1 }),200);
  check(await write(ids.student,path,{ status: 'reserved', appointmentId: 'nonexistent',
    facilitatorId: ids.outsider, startTime: 999 },true),200);
});
test('OPEN SEC-010: deactivated owners can still read their Firestore profile', async () => {
  const ids = await setup(),path = `profiles/${ids.disabled}`;
  check(await write('owner',path,{ uid: ids.disabled, campus: 'synthetic' }),200);
  const response = await fetch(`${base}/${path}`,{ headers: { Authorization: `Bearer ${token(ids.disabled)}` } });
  assert.equal(response.status,200);
});
const apps = [];
function storageFor(uid) {
  const app = initializeApp({ projectId: project, storageBucket: `${project}.appspot.com`, apiKey: 'emulator-only' },`security_${uid}`);
  apps.push(app);
  const storage = getStorage(app),[address,port] = storageHost.split(':');
  connectStorageEmulator(storage,address,Number(port),{ mockUserToken: { sub: uid, user_id: uid } });
  return storage;
}
after(async () => { for (const app of apps) await deleteApp(app); });
test('conversation attachments permit members and deny outsider reads, writes, and inactive-owner uploads', async () => {
  const ids = await setup();
  const member = storageFor(ids.student), staff = storageFor(ids.facilitator), outsider = storageFor(ids.outsider), disabled = storageFor(ids.disabled);
  const path = `messages/${ids.conversation}/synthetic.pdf`, content = new Uint8Array([1,2,3]);
  await uploadBytes(ref(member,path),content,{ contentType: 'application/pdf' });
  assert.deepEqual(new Uint8Array(await getBytes(ref(staff,path))),content);
  await assert.rejects(getBytes(ref(outsider,path)),{ code: 'storage/unauthorized' });
  await assert.rejects(uploadBytes(ref(outsider,path),content,{ contentType: 'application/pdf' }),{ code: 'storage/unauthorized' });
  await assert.rejects(uploadBytes(ref(disabled,`avatars/${ids.disabled}/synthetic.png`),content,{ contentType: 'image/png' }),{ code: 'storage/unauthorized' });
});
