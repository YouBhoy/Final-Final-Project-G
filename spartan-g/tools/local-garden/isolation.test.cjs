const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../apps/mobile/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
function load(file, imports = {}, globals = {}) {
  const filename = path.join(root, file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  const context = { module, exports: module.exports, console: { info() {} }, ...globals,
    require: name => { assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`); return imports[name]; } };
  vm.runInNewContext(output, context, { filename });
  Object.defineProperty(module.exports, '__testContext', { value: context });
  return module.exports;
}
const base = 'packages/shared-services/src/';
const contract = load(`${base}config/local-emulator-contract.ts`);
const local = contract.buildLocalEmulatorConfig('1', true);

test('local mode is off by default and explicit opt-in cannot enable a release build', () => {
  for (const flag of [undefined, '', '0']) assert.equal(contract.buildLocalEmulatorConfig(flag, false).enabled, false);
  assert.equal(local.projectId, 'demo-spartan-g-garden-phase2');
  for (const flag of ['true', 'yes', 'production', '1']) assert.throws(() => contract.buildLocalEmulatorConfig(flag, false), /development build/);
});
test('native config applies the dev-build gate; default/web resolution remains disabled', () => {
  const imports = { './local-emulator-contract': contract };
  assert.throws(() => load(`${base}config/local-emulators.native.ts`, imports,
    { process: { env: { EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE: '1' } }, __DEV__: false }), /development build/);
  assert.equal(load(`${base}config/local-emulators.native.ts`, imports,
    { process: { env: { EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE: '1' } }, __DEV__: true }).localEmulators.enabled, true);
  assert.equal(load(`${base}config/local-emulators.ts`).localEmulators.enabled, false);
});
test('only exact local service/Metro URLs are allowed', () => {
  for (const port of [8083, 15001, 19099, 18089, 19098]) contract.assertLocalUrl(`http://10.0.2.2:${port}/fixture`);
  contract.assertLocalUrl('ws://10.0.2.2:8083/hot');
  for (const url of ['https://firestore.googleapis.com/', 'https://identitytoolkit.googleapis.com/',
    'http://10.0.2.2:8082/', 'http://10.0.2.2.evil:19099/', 'http://10.0.2.2:19099@evil/', 'http://localhost:19099/']) {
    assert.throws(() => contract.assertLocalUrl(url), /BLOCKED_NONLOCAL/);
  }
});
test('health rejects unavailable, wrong-project, wrong-rules and unisolated environments', () => {
  const valid = { ready: true, projectId: local.projectId, rulesSha256: contract.LOCAL_GARDEN_RULES_SHA256,
    authPort: 19099, firestorePort: 18089, functionsPort: 15001, region: 'us-central1', deviceIsolation: true };
  contract.validateLocalHealth(valid);
  for (const patch of [{ ready: false }, { projectId: 'production' }, { rulesSha256: 'wrong' }, { deviceIsolation: false }, { authPort: 9099 },
    { functionsPort: undefined }, { functionsPort: 5001 }, { region: 'wrong' }]) {
    assert.throws(() => contract.validateLocalHealth({ ...valid, ...patch }));
  }
});
test('readiness expires and blocks SDK access rather than falling back', () => {
  let now = 1000;
  const state = load(`${base}firebase/local-emulator-state.ts`, { '../config/local-emulators': { localEmulators: local } }, { Date: { now: () => now } });
  assert.throws(() => state.assertLocalEmulatorsReady(), /production fallback is disabled/);
  state.setLocalEmulatorsReady(true); state.assertLocalEmulatorsReady();
  now = 25000; state.assertLocalEmulatorsReady();
  now = 27000; assert.throws(() => state.assertLocalEmulatorsReady());
});
test('local initialization selects a named synthetic app, never the first production app', () => {
  const calls = [];
  const app = load(`${base}firebase/app.ts`, {
    'firebase/app': { getApps: () => [{ name: '[DEFAULT]', options: { projectId: 'production' } }],
      initializeApp: (options, name) => { calls.push({ options, name }); return { options, name }; } },
    '../config/env': { env: { firebase: { projectId: local.projectId } } },
    '../config/local-emulators': { localEmulators: local },
    './local-emulator-state': { assertLocalEmulatorsReady() {} },
  });
  assert.equal(app.getFirebaseApp().name, local.appName);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.projectId, local.projectId);
});
test('auth connects synchronously before returning the SDK instance', () => {
  const calls = [];
  const instance = { app: { name: local.appName } };
  const module = load(`${base}firebase/auth.ts`, {
    'firebase/auth': { getAuth: () => { calls.push('get'); return instance; },
      connectAuthEmulator: (auth, url) => { calls.push(url); auth.emulatorConfig = { host: local.host, port: local.authPort }; } },
    './app': { getFirebaseApp: () => instance.app }, '../config/local-emulators': { localEmulators: local },
    './local-emulator-state': { assertLocalEmulatorsReady() { calls.push('ready'); } },
  });
  module.getFirebaseAuth();
  assert.deepEqual(calls, ['ready', 'get', 'http://10.0.2.2:19099']);
});
test('a failed local Firestore connection cannot take the existing normal-mode fallback', () => {
  let fallback = false;
  const module = load(`${base}firebase/firestore.ts`, {
    'firebase/firestore': { initializeFirestore: () => ({}), memoryLocalCache: () => ({}),
      connectFirestoreEmulator: () => { throw new Error('synthetic local failure'); },
      getFirestore: () => { fallback = true; return {}; } },
    './app': { getFirebaseApp: () => ({ name: local.appName }) },
    '../config/local-emulators': { localEmulators: local },
    './local-emulator-state': { assertLocalEmulatorsReady() {} },
  });
  assert.throws(() => module.getFirestoreDb(), /synthetic local failure/);
  assert.equal(fallback, false);
});
test('local native env ignores production Firebase environment values', () => {
  const module = load(`${base}config/env.native.ts`, {
    './env.shared': { resolveDeploymentTarget() {} }, './local-emulators': { localEmulators: local },
  }, { process: { env: { EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'production', EXPO_PUBLIC_FIREBASE_API_KEY: 'production-placeholder' } } });
  assert.equal(module.env.firebase.projectId, local.projectId);
  assert.equal(module.env.firebase.apiKey, 'synthetic-local-emulator-only');
});
test('installed network guard rejects production fetch, XHR and WebSocket before transport', async () => {
  const calls = [];
  class Xhr { open(method, url) { calls.push(url); } }
  class Socket { constructor(url) { calls.push(url); } }
  const globals = { URL, XMLHttpRequest: Xhr, WebSocket: Socket, fetch: async url => { calls.push(url); return {}; } };
  const module = load('apps/mobile/src/development/localNetworkGuard.ts', {
    '@spartan-g/shared-services/src/config/local-emulator-contract': contract,
  }, globals);
  module.installLocalNetworkGuard();
  await assert.rejects(() => module.__testContext.fetch('https://identitytoolkit.googleapis.com/'), /BLOCKED_NONLOCAL/);
  assert.throws(() => new Xhr().open('GET', 'https://firestore.googleapis.com/'), /BLOCKED_NONLOCAL/);
  assert.throws(() => new module.__testContext.WebSocket('wss://firestore.googleapis.com/'), /BLOCKED_NONLOCAL/);
  assert.deepEqual(calls, []);
  new Xhr().open('GET', 'http://10.0.2.2:18089/test');
  assert.equal(calls.length, 1);
});
