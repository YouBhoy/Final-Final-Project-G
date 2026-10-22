import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const originalStorage = globalThis.sessionStorage;
afterEach(() => { if (originalStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = originalStorage; });
const policyCode = ts.transpileModule(readFileSync(new URL('../src/lib/adminTabSession.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const policyUrl = `data:text/javascript;base64,${Buffer.from(policyCode).toString('base64')}`;
const policy = await import(policyUrl);

// Execute the real auth module with instrumented Firebase boundaries.
async function setup() {
  const storage = new Map();
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  policy.beginAdminTabSession('admin');
  const doubles = `
import { beginAdminTabSession, clearAdminTabSession, hasAdminTabSession } from ${JSON.stringify(policyUrl)};
export const fixture = { profile: { role: 'super_admin', isActive: true }, listeners: [], currentUser: null, events: [], signouts: 0, persistences: [] };
const auth = { get currentUser() { return fixture.currentUser; } }, db = {};
const inMemoryPersistence = 'memory', browserSessionPersistence = 'session', browserLocalPersistence = 'local';
const setPersistence = async (_, persistence) => { fixture.persistences.push(persistence); if (fixture.failPersistence === persistence) throw new Error('Persistence unavailable'); };
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
const signInWithEmailAndPassword = async (_, email, password) => {
  fixture.credentials = { email, password };
  if (fixture.signInError) throw fixture.signInError;
  return { user: fixture.currentUser };
};
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

test('login trims email whitespace while preserving the exact password', async () => {
  const app = await setup();
  await app.emitAuth();
  await app.loginUser(' admin@example.com ', ' password with spaces ');
  assert.deepEqual(app.fixture.credentials, { email: 'admin@example.com', password: ' password with spaces ' });
});

test('invalid credentials give reset guidance and never create a session grant', async () => {
  const app = await setup();
  app.fixture.signInError = { code: 'auth/invalid-credential' };
  await assert.rejects(app.loginUser('admin@example.com', 'incorrect'), /Email or password is incorrect.*Forgot password/);
  assert.equal(policy.hasAdminTabSession('admin'), false);
  assert.equal(app.fixture.signouts, 1);
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

test('new admin login chooses memory first, then tab persistence after server role validation', async () => {
  const app = await setup();
  policy.clearAdminTabSession();
  app.fixture.currentUser = { uid: 'admin', email: 'admin@example.com' };
  const session = await app.loginUser('admin@example.com', 'synthetic-password');
  assert.equal(session.role, 'super_admin');
  assert.deepEqual(app.fixture.persistences, ['memory', 'session']);
  assert.equal(policy.hasAdminTabSession('admin'), true);
});

test('student and facilitator logins keep persistent sign-in without an admin tab grant', async () => {
  for (const role of ['student', 'facilitator']) {
    const app = await setup();
    app.fixture.currentUser = { uid: role, email: `${role}@example.com` };
    app.fixture.profile = { role, isActive: true };
    await app.loginUser(`${role}@example.com`, 'synthetic-password');
    assert.deepEqual(app.fixture.persistences, ['memory', 'local']);
    assert.equal(policy.hasAdminTabSession('admin'), false);
    assert.equal(policy.hasAdminTabSession(role), false);
  }
});

test('a restored legacy admin login without a tab grant is signed out before portal access', async () => {
  const app = await setup();
  policy.clearAdminTabSession();
  await app.emitAuth();
  app.emitProfile({ role: 'super_admin', isActive: true });
  assert.equal(app.session(), null);
  assert.equal(app.fixture.signouts, 1);
});

test('a valid tab session survives page restoration and logout removes its grant', async () => {
  const app = await setup();
  await app.emitAuth();
  app.emitProfile({ role: 'super_admin', isActive: true });
  assert.equal(app.session().role, 'super_admin');
  await app.logoutUser();
  assert.equal(policy.hasAdminTabSession('admin'), false);
});

test('failure to set tab persistence clears the grant and signs out instead of falling back to local login', async () => {
  const app = await setup();
  app.fixture.currentUser = { uid: 'admin', email: 'admin@example.com' };
  app.fixture.failPersistence = 'session';
  await assert.rejects(app.loginUser('admin@example.com', 'synthetic-password'), /Persistence unavailable/);
  assert.equal(policy.hasAdminTabSession('admin'), false);
  assert.equal(app.fixture.signouts, 1);
  assert.ok(!app.fixture.persistences.includes('local'));
});
