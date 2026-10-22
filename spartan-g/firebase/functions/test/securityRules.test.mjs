import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

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
// Regression checks for the access/integrity gaps reproduced in the audit.
test('unrelated students cannot read private active appointment records', async () => {
  const ids = await setup(), path = `appointments/${ids.conversation}`;
  check(await write('owner',path,{ studentId: ids.student, facilitatorId: ids.facilitator,
    status: 'requested', notes: 'Synthetic private appointment note' }),200);
  const response = await fetch(`${base}/${path}`,{ headers: { Authorization: `Bearer ${token(ids.outsider)}` } });
  assert.equal(response.status,403);
  const owner = await fetch(`${base}/${path}`,{ headers: { Authorization: `Bearer ${token(ids.student)}` } });
  assert.equal(owner.status,200);
});
test('students cannot supply their own risk classification on submission', async () => {
  const ids = await setup(), path = `assessment_attempts/${ids.conversation}`;
  check(await write('owner',path,{ studentId: ids.student, assessmentId: 'synthetic', status: 'in_progress', attemptNumber: 1 }),200);
  check(await write(ids.student,path,{ status: 'submitted', overallRiskLevel: 'low', overallRiskScore: 0 },true),403);
  check(await write(ids.student,path,{ status: 'submitted' },true),200);
});
test('an unrelated user cannot forge a notification for another user', async () => {
  const ids = await setup();
  check(await write(ids.outsider,`notifications/${ids.conversation}`,{ userId: ids.student,
    title: 'Synthetic spoofed notification', body: 'Synthetic', type: 'message' }),403);
});
test('slot reservations reject unrelated identity and time changes', async () => {
  const ids = await setup(), path = `appointment_slots/${ids.conversation}`;
  check(await write('owner',path,{ facilitatorId: ids.facilitator, status: 'available', startTime: 1 }),200);
  check(await write(ids.student,path,{ status: 'reserved', appointmentId: 'nonexistent',
    facilitatorId: ids.outsider, startTime: 999 },true),403);
});
test('deactivated owners cannot read their Firestore profile', async () => {
  const ids = await setup(),path = `profiles/${ids.disabled}`;
  check(await write('owner',path,{ uid: ids.disabled, campus: 'synthetic' }),200);
  const response = await fetch(`${base}/${path}`,{ headers: { Authorization: `Bearer ${token(ids.disabled)}` } });
  assert.equal(response.status,403);
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

test('student assignment files are private to their owner, assigned facilitator and admin', async () => {
  const ids = await setup();
  const owner = storageFor(ids.student), outsider = storageFor(ids.outsider), facilitator = storageFor(ids.facilitator), admin = storageFor(ids.admin);
  const path = `assignments/synthetic-course/synthetic-assignment/${ids.student}/private.pdf`;
  const content = new Uint8Array([1,2,3]);
  await uploadBytes(ref(owner,path),content,{ contentType: 'application/pdf' });
  await assert.rejects(getBytes(ref(outsider,path)), { code: 'storage/unauthorized' });
  await assert.rejects(getBytes(ref(facilitator,path)), { code: 'storage/unauthorized' });
  await assert.rejects(deleteObject(ref(facilitator,path)), { code: 'storage/unauthorized' });
  check(await write('owner', `facilitator_student_links/${ids.facilitator}_${ids.student}`, { studentId: ids.student, facilitatorId: ids.facilitator, status: 'accepted' }), 200);
  assert.deepEqual(new Uint8Array(await getBytes(ref(facilitator,path))), content);
  assert.deepEqual(new Uint8Array(await getBytes(ref(admin,path))), content);
});

test('students cannot start conversations with unrelated students or unassigned facilitators', async () => {
  const ids = await setup();
  check(await write(ids.student, `conversations/${ids.conversation}_peer`, { participantIds: [ids.student, ids.outsider] }), 403);
  check(await write(ids.student, `conversations/${ids.conversation}_unassigned`, { participantIds: [ids.student, ids.facilitator] }), 403);
  check(await write('owner', `facilitator_student_links/${ids.facilitator}_${ids.student}`, { studentId: ids.student, facilitatorId: ids.facilitator, status: 'accepted' }), 200);
  check(await write(ids.student, `conversations/${ids.conversation}_assigned`, { participantIds: [ids.student, ids.facilitator] }), 200);
});

test('resource file downloads enforce publication and audience restrictions', async () => {
  const ids = await setup(), resourceId = `${ids.conversation}_resource`;
  const admin = storageFor(ids.admin), student = storageFor(ids.student), facilitator = storageFor(ids.facilitator);
  const path = `resources/${resourceId}/staff.pdf`, content = new Uint8Array([1,2,3]);
  await uploadBytes(ref(admin,path), content, { contentType: 'application/pdf' });
  check(await write('owner', `resources/${resourceId}`, { isActive: true, audience: 'facilitators' }), 200);
  await assert.rejects(getBytes(ref(student,path)), { code: 'storage/unauthorized' });
  assert.deepEqual(new Uint8Array(await getBytes(ref(facilitator,path))), content);
  check(await write('owner', `resources/${resourceId}`, { isActive: false }, true), 200);
  await assert.rejects(getBytes(ref(facilitator,path)), { code: 'storage/unauthorized' });
  assert.deepEqual(new Uint8Array(await getBytes(ref(admin,path))), content);
});
