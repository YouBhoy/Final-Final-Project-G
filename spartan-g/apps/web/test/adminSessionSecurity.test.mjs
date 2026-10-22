import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the real auth module with instrumented Firebase boundaries.
async function setup() {
  const doubles = `
export const fixture = { profile: { role: 'super_admin', isActive: true }, listeners: [], currentUser: null, events: [], signouts: 0 };
const auth = { get currentUser() { return fixture.currentUser; } }, db = {};
const doc = (_, collection, uid) => ({ collection, uid });
const snapshot = (data, metadata = {}) => ({ exists: () => data !== null, data: () => data,
  metadata: { fromCache: false, hasPendingWrites: false, ...metadata } });
const getDoc = async () => snapshot(fixture.profile);
const getDocFromServer = getDoc;
const onAuthStateChanged = (_, listener) => { fixture.authListener = listener; return () => { fixture.authStopped = true; }; };
const onSnapshot = (ref, options, next, error) => {
  const listener = { ref, options, next, error, stopped: false };
  fixture.listeners.push(listener); return () => { listener.stopped = true; };
};
const signInWithEmailAndPassword = async () => ({ user: fixture.currentUser });
const signOut = async () => { fixture.signouts++; fixture.currentUser = null; };
export async function emitAuth(uid = 'admin') {
  fixture.currentUser = uid ? { uid, email: uid + '@example.com', displayName: uid } : null;
  await fixture.authListener(fixture.currentUser);
}
export function emitProfile(data, metadata, index = fixture.listeners.length - 1) {
  fixture.profile = data;
  fixture.listeners[index]?.next(snapshot(data, metadata));
}
`;
  const source = readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '');
  const code = ts.transpileModule(doubles + source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${Math.random()}`);
  const stop = module.onAuthChange(session => module.fixture.events.push(session));
  return { ...module, stop, session: () => module.fixture.events.at(-1) };
}

test('an already-open admin session loses access immediately when disabled or demoted', async () => {
  const app = await setup();
  await app.emitAuth();
  app.emitProfile({ role: 'super_admin', isActive: true });
  assert.equal(app.session().role, 'super_admin');
  app.emitProfile({ role: 'super_admin', isActive: false });
  assert.equal(app.session(), null);
  app.emitProfile({ role: 'student', isActive: true });
  assert.equal(app.session().role, 'student');
});

test('cached and uncommitted role claims never authorize admin access', async () => {
  const app = await setup();
  await app.emitAuth();
  app.emitProfile({ role: 'super_admin', isActive: true }, { fromCache: true });
  assert.equal(app.session(), null);
  app.emitProfile({ role: 'super_admin', isActive: true }, { hasPendingWrites: true });
  assert.equal(app.session(), null);
  app.emitProfile({ role: 'super_admin', isActive: true });
  assert.equal(app.session().role, 'super_admin');
});

test('missing accounts, malformed roles and truthy non-boolean active flags fail closed', async () => {
  const app = await setup();
  await app.emitAuth();
  for (const profile of [null, { role: 'owner', isActive: true }, { role: 'super_admin', isActive: 'true' }]) {
    app.emitProfile(profile);
    assert.equal(app.session(), null);
  }
});

test('listener errors close an authorized session', async () => {
  const app = await setup();
  await app.emitAuth();
  app.emitProfile({ role: 'super_admin', isActive: true });
  assert.equal(app.session().role, 'super_admin');
  app.fixture.listeners.at(-1)?.error(new Error('permission-denied'));
  assert.equal(app.session(), null);
});

test('account switches clear the old session and ignore late snapshots from the old account', async () => {
  const app = await setup();
  await app.emitAuth();
  app.emitProfile({ role: 'super_admin', isActive: true });
  await app.emitAuth('student');
  assert.equal(app.session(), null);
  app.emitProfile({ role: 'super_admin', isActive: true }, {}, 0);
  assert.equal(app.session(), null);
  app.emitProfile({ role: 'student', isActive: true });
  assert.equal(app.session().uid, 'student');
  assert.equal(app.session().role, 'student');
});

test('unsubscribe removes both listeners and ignores late events', async () => {
  const app = await setup();
  await app.emitAuth();
  app.stop();
  assert.equal(app.fixture.authStopped, true);
  assert.equal(app.fixture.listeners[0]?.stopped, true);
  const count = app.fixture.events.length;
  app.emitProfile({ role: 'super_admin', isActive: true });
  assert.equal(app.fixture.events.length, count);
});
