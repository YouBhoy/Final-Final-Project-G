const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('../../apps/mobile/node_modules/typescript');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const sdk = require('firebase/firestore');
const project = 'demo-spartan-g-local-garden';
const root = path.resolve(__dirname, '../..');
const privateData = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'spartan-g-local-garden-runtime/private-credentials.json'), 'utf8'));
assert.equal(privateData.projectId, project);
const contexts = [];
async function context(fixture) {
  const app = initializeApp({ projectId: project, apiKey: 'synthetic-local-emulator-only' }, `fixture-${contexts.length}`);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true });
  const db = sdk.getFirestore(app); sdk.connectFirestoreEmulator(db, '127.0.0.1', 18089);
  const result = { app, auth, db }; contexts.push(result);
  if (fixture) {
    const account = privateData.accounts.find(account => account.fixture === fixture);
    const credentials = await signInWithEmailAndPassword(auth, account.email, account.password);
    assert.equal(credentials.user.uid, account.uid);
    result.uid = account.uid;
  }
  return result;
}
after(async () => { for (const item of contexts) { await sdk.terminate(item.db); await deleteApp(item.app); } });
const garden = (ctx, uid = ctx.uid) => sdk.doc(ctx.db, `student_gardens/${uid}`);

test('real Auth emulator sign-in resolves the synthetic active student profile', async () => {
  const ctx = await context('existing');
  const data = (await sdk.getDocFromServer(sdk.doc(ctx.db, `users/${ctx.uid}`))).data();
  assert.equal(data.role, 'student'); assert.equal(data.isActive, true);
});
test('existing Garden retains level 3, XP 25 and seeds 12', async () => {
  const ctx = await context('existing'); const data = (await sdk.getDocFromServer(garden(ctx))).data();
  assert.deepEqual([data.level, data.xp, data.seeds], [3, 25, 12]);
});
test('authenticated student cannot read another fixture Garden', async () => {
  const ctx = await context('existing');
  await assert.rejects(() => sdk.getDocFromServer(garden(ctx, 'local-garden-other')), error => error.code === 'permission-denied');
});
test('unauthenticated Garden reads are denied', async () => {
  const ctx = await context();
  await assert.rejects(() => sdk.getDocFromServer(garden(ctx, 'local-garden-existing')), error => error.code === 'permission-denied');
});
test('candidate rules deny direct reward modification', async () => {
  const ctx = await context('existing');
  await assert.rejects(() => sdk.updateDoc(garden(ctx), { xp: sdk.increment(10) }), error => error.code === 'permission-denied');
});
function source(relative, imports) {
  const filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){\n${output}\n})`, { filename })(name => {
    assert.ok(Object.hasOwn(imports, name)); return imports[name];
  }, module, module.exports);
  return module.exports;
}
test('unchanged Garden service initializes a first-time synthetic account to exact defaults', async () => {
  const ctx = await context('automated');
  assert.equal((await sdk.getDocFromServer(garden(ctx))).exists(), false);
  const repository = source('packages/shared-services/src/repositories/garden.repository.ts', {
    '@spartan-g/shared-types': { COLLECTIONS: { STUDENT_GARDENS: 'student_gardens' } },
    '../firebase/firestore': { ...sdk, getFirestoreDb: () => ctx.db }, 'firebase/firestore': sdk,
  }).gardenRepository;
  const service = source('packages/shared-services/src/services/garden.service.ts', {
    '../repositories/garden.repository': { gardenRepository: repository },
  }).gardenService;
  const result = await service.getOrCreateGarden(ctx.uid);
  assert.deepEqual([result.level, result.xp, result.seeds, result.streakCount], [1, 0, 0, 0]);
  assert.equal(result.lastWateredDate, ''); assert.equal(result.lastCheckInDate, '');
  const again = await service.getOrCreateGarden(ctx.uid); assert.deepEqual(again, result);
});
test('the Android first-time fixture still has no Garden before runtime testing', async () => {
  const ctx = await context('missing'); assert.equal((await sdk.getDocFromServer(garden(ctx))).exists(), false);
});
