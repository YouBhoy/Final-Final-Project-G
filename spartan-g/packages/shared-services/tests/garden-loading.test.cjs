const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../../..');
const ts = createRequire(path.join(root, 'apps/mobile/package.json'))('typescript');

function loadTs(relativePath, imports = {}, consoleMock = console) {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  const evaluate = vm.runInThisContext(`(function(require, module, exports, console) {\n${outputText}\n})`, { filename });
  evaluate((name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected runtime import: ${name}`);
    return imports[name];
  }, module, module.exports, consoleMock);
  return module.exports;
}

// Actual Garden code, with every database operation replaced by an in-memory
// implementation. Loading Firebase SDKs or making network calls is unnecessary.
function harness({ existing, readError, createError } = {}) {
  const { COLLECTIONS } = loadTs('packages/shared-types/src/constants/collections.ts');
  const documents = new Map(existing ? [['student_gardens/fixture-student', existing]] : []);
  const operations = [];
  const errors = [];
  const timestamp = Object.freeze({ sentinel: 'serverTimestamp' });
  const firestore = {
    getFirestoreDb: () => ({}),
    doc: (_db, collection, id) => ({ path: `${collection}/${id}`, id }),
    getDoc: async (ref) => {
      operations.push({ kind: 'read', path: ref.path });
      if (readError) throw readError;
      return { id: ref.id, exists: () => documents.has(ref.path), data: () => documents.get(ref.path) };
    },
    setDoc: async (ref, data) => {
      operations.push({ kind: 'create', path: ref.path, data });
      if (createError) throw createError;
      documents.set(ref.path, data);
    },
    updateDoc: () => assert.fail('Loading must not update progression or rewards'),
    serverTimestamp: () => timestamp,
  };
  const { gardenRepository } = loadTs('packages/shared-services/src/repositories/garden.repository.ts', {
    '@spartan-g/shared-types': { COLLECTIONS },
    '../firebase/firestore': firestore,
    'firebase/firestore': { increment: () => assert.fail('Loading must not calculate rewards') },
  });
  const { gardenService } = loadTs('packages/shared-services/src/services/garden.service.ts', {
    '../repositories/garden.repository': { gardenRepository },
  }, { error: (...args) => errors.push(args) });
  return { gardenRepository, gardenService, operations, errors, timestamp };
}

function permissionDenied() {
  return Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied', name: 'FirebaseError',
  });
}

test('an existing Garden is returned with its hydrated ID and no writes', async () => {
  const existing = { studentId: 'fixture-student', level: 3, xp: 17, seeds: 20, streakCount: 4, lastCheckInDate: '2026-10-14', lastWateredDate: '' };
  const h = harness({ existing });
  assert.deepEqual(await h.gardenService.getOrCreateGarden('fixture-student'), { id: 'fixture-student', ...existing });
  assert.deepEqual(h.operations, [{ kind: 'read', path: 'student_gardens/fixture-student' }]);
  assert.deepEqual(h.errors, []);
});

test('the repository alone reports an absent document without initializing it', async () => {
  const h = harness();
  assert.equal(await h.gardenRepository.getGarden('fixture-student'), null);
  assert.deepEqual(h.operations, [{ kind: 'read', path: 'student_gardens/fixture-student' }]);
});

test('a denied read returns null, retains the original logged exception, and never creates a Garden', async () => {
  const cause = permissionDenied();
  const h = harness({ readError: cause });
  assert.equal(await h.gardenService.getOrCreateGarden('fixture-student'), null);
  assert.deepEqual(h.operations, [{ kind: 'read', path: 'student_gardens/fixture-student' }]);
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0][0], '[GardenService] getOrCreateGarden failed:');
  assert.equal(h.errors[0][1], cause);
});

test('first-time initialization writes only the existing defaults in the mock database', async () => {
  const h = harness();
  const result = await h.gardenService.getOrCreateGarden('fixture-student');
  const defaults = {
    studentId: 'fixture-student', level: 1, xp: 0, seeds: 0, streakCount: 0,
    lastCheckInDate: '', lastWateredDate: '', createdAt: h.timestamp, updatedAt: h.timestamp,
  };
  assert.deepEqual(result, { id: 'fixture-student', ...defaults });
  assert.deepEqual(h.operations, [
    { kind: 'read', path: 'student_gardens/fixture-student' },
    { kind: 'create', path: 'student_gardens/fixture-student', data: defaults },
    { kind: 'read', path: 'student_gardens/fixture-student' },
  ]);
});

test('a denied creation is distinguishable from a denied initial read in operation tracing', async () => {
  const cause = permissionDenied();
  const h = harness({ createError: cause });
  assert.equal(await h.gardenService.getOrCreateGarden('fixture-student'), null);
  assert.deepEqual(h.operations.map((op) => op.kind), ['read', 'create']);
  assert.equal(h.errors[0][1], cause);
});

test('network failures also return null without initialization or reward operations', async () => {
  const cause = Object.assign(new Error('Service unavailable'), { code: 'unavailable' });
  const h = harness({ readError: cause });
  assert.equal(await h.gardenService.getOrCreateGarden('fixture-student'), null);
  assert.deepEqual(h.operations, [{ kind: 'read', path: 'student_gardens/fixture-student' }]);
  assert.equal(h.errors[0][1], cause);
});
