import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const policyUrl = url(transpile(readFileSync(new URL('../src/lib/pseudonymization.ts', import.meta.url), 'utf8')));
async function identityFixture() {
  const doubles = `
import { createPseudonymizer } from ${JSON.stringify(policyUrl)};
export const state = { reads: [], consent: undefined, link: undefined, booking: undefined, student: { role: 'student', isActive: true, displayName: 'Private name', email: 'private@example.com' }, fail: null };
const db = {};
const doc = (_, collection, id) => ({ collection, id });
const getDocFromServer = async ref => { state.reads.push(ref.collection); if (state.fail === ref.collection) throw new Error('permission-denied'); return { data: () => ({ users: state.student, student_identity_consents: state.consent, facilitator_student_links: state.link, appointments: state.booking })[ref.collection] }; };
`;
  const source = readFileSync(new URL('../src/lib/studentIdentity.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  return import(url(transpile(doubles + source)) + '#' + Math.random());
}

test('missing, forged and unavailable consent never trigger a private profile read', async () => {
  const f = await identityFixture();
  for (const consent of [undefined, { studentId: 'other', facilitatorId: 'fac' }, { studentId: 'student', facilitatorId: 'other' }]) {
    f.state.consent = consent;
    const result = await f.resolveStudentIdentity('fac', 'student');
    assert.equal(result.identityShared, false);
    assert.equal(JSON.stringify(result).includes('Private name'), false);
  }
  f.state.fail = 'student_identity_consents';
  assert.equal((await f.resolveStudentIdentity('fac', 'student')).identityShared, false);
  assert.equal(f.state.reads.includes('users'), false);
  assert.equal(f.studentAlias('fac', 'student'), f.studentAlias('fac', 'student'));
  assert.notEqual(f.studentAlias('fac', 'student'), f.studentAlias('other', 'student'));
  assert.equal(f.studentAlias('fac', 'student').includes('student'), false);
});

test('server-authorized consent resolves names; profile denial still returns an alias', async () => {
  const f = await identityFixture();
  f.state.consent = { studentId: 'student', facilitatorId: 'fac' };
  assert.deepEqual(await f.resolveStudentIdentity('fac', 'student'), { displayName: 'Private name', email: 'private@example.com', identityShared: true });
  f.state.fail = 'users';
  const hidden = await f.resolveStudentIdentity('fac', 'student');
  assert.equal(hidden.identityShared, false);
  assert.equal(hidden.email, 'Identity not shared');
});

test('appointment and chat contexts reveal a verified booked student without changing default masking', async () => {
  const f = await identityFixture();
  f.state.link = { studentId: 'student', facilitatorId: 'fac', status: 'accepted', appointmentId: 'booking' };
  f.state.booking = { studentId: 'student', facilitatorId: 'fac', status: 'accepted' };
  assert.equal((await f.resolveStudentIdentity('fac', 'student')).identityShared, false);
  assert.equal((await f.resolveStudentIdentity('fac', 'student', true)).displayName, 'Private name');
  f.state.booking.facilitatorId = 'other';
  assert.equal((await f.resolveStudentIdentity('fac', 'student', true)).identityShared, false);
  f.state.booking.facilitatorId = 'fac';
  f.state.booking.status = 'requested';
  assert.equal((await f.resolveStudentIdentity('fac', 'student', true)).identityShared, false);
  f.state.booking.status = 'completed';
  f.state.link.status = 'rejected';
  assert.equal((await f.resolveStudentIdentity('fac', 'student', true)).identityShared, false);
});

test('identity sharing control writes only after an explicit student action, then permits revocation', async () => {
  const doubles = `
export const state = { shared: false, writes: [], deletes: [], user: { uid: 'student', role: 'student' } };
export const db = {};
export const useAuth = () => ({ user: state.user });
export const doc = (_, collection, id) => ({ collection, id });
export const getDocFromServer = async () => ({ exists: () => state.shared });
export const serverTimestamp = () => 'SERVER_TIMESTAMP';
export const setDoc = async (ref, data) => { state.writes.push({ ref, data }); state.shared = true; };
export const deleteDoc = async ref => { state.deletes.push(ref); state.shared = false; };
`;
  const fixtureUrl = url(doubles);
  const state = (await import(fixtureUrl)).state;
  const code = transpile(readFileSync(new URL('../src/components/appointments/StudentIdentitySharing.tsx', import.meta.url), 'utf8'))
    .replace(/(['"])react\1/g, JSON.stringify(import.meta.resolve('react')))
    .replace(/(['"])react\/jsx-runtime\1/g, JSON.stringify(import.meta.resolve('react/jsx-runtime')))
    .replace(/(['"])(?:firebase\/firestore|\.\.\/\.\.\/firebase\/firebase|\.\.\/\.\.\/hooks\/useAuth)\1/g, JSON.stringify(fixtureUrl));
  const { StudentIdentitySharing } = await import(url(code));
  let root;
  try {
    await act(async () => { root = Renderer.create(React.createElement(StudentIdentitySharing, { facilitatorId: 'fac' })); });
    assert.equal(state.writes.length, 0);
    assert.ok(JSON.stringify(root.toJSON()).includes('Request support and share my identity'));
    await act(async () => root.root.findByType('button').props.onClick());
    assert.deepEqual(state.writes, [{ ref: { collection: 'student_identity_consents', id: 'fac_student' }, data: { studentId: 'student', facilitatorId: 'fac', requestedAt: 'SERVER_TIMESTAMP' } }]);
    assert.ok(JSON.stringify(root.toJSON()).includes('Stop sharing my identity'));
    await act(async () => root.root.findByType('button').props.onClick());
    assert.equal(state.deletes.length, 1);
  } finally { if (root) act(() => root.unmount()); }
});
