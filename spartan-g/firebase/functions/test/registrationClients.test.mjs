import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const { transformSync } = require('esbuild');

// Replace Firebase boundaries with instrumented doubles; execute the real registration code.
const doubles = `
export const calls = { authCreated: 0, users: [], profiles: [] };
const auth = {}, db = {};
const browserLocalPersistence = {};
async function setPersistence() {}
const serverTimestamp = () => 'server-time';
const doc = (_, collection, uid) => ({ collection, uid });
async function createUserWithEmailAndPassword(_, email) {
  calls.authCreated++;
  return { user: { uid: 'new-student', email, emailVerified: false, displayName: 'Student' } };
}
async function updateProfile() {}
async function setDoc(ref, data) { calls[ref.collection].push(data); }
`;
async function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '');
  const output = transformSync(doubles + source, { loader: 'ts', format: 'esm' }).code;
  // A unique URL keeps each test's Firebase doubles isolated.
  const module = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}#${Math.random()}`);
  return { module, register: (role) => module.registerUser('s@example.com', 'test-password', 'First', 'Last', role, 'lipa') };
}

for (const [name, path] of [
  ['web', '../../../apps/web/src/lib/auth.ts'],
]) {
  test(`${name}: staff and unexpected roles are rejected before creating an Auth account`, async () => {
    const { module, register } = await load(path);
    for (const role of ['facilitator', 'super_admin', 'unexpected-role']) {
      await assert.rejects(register(role), /students only/);
    }
    assert.equal(module.calls.authCreated, 0);
    assert.deepEqual(module.calls.users, []);
    assert.deepEqual(module.calls.profiles, []);
  });
  test(`${name}: default public signup creates a student and initial profile`, async () => {
    const { module, register } = await load(path);
    const session = await register(undefined);
    assert.equal(session.role, 'student');
    assert.equal(module.calls.authCreated, 1);
    assert.equal(module.calls.users[0].role, 'student');
    assert.equal(module.calls.users[0].isActive, true);
    assert.equal(module.calls.profiles[0].uid, 'new-student');
  });
}
