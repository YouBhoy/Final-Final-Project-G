const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../../apps/mobile/node_modules/typescript');
const uuid = '5ab55941-90f8-4000-8000-4b8782b88233';
function load(file, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, console: { error() {} },
    require: name => { assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`); return imports[name]; } });
  return module.exports;
}
const { GardenOperationsClient } = load('packages/shared-services/src/services/garden-operations.client.ts');
function setup(invoke, saved = new Map()) {
  const calls = [];
  const dependencies = { storage: { read: async uid => saved.get(uid) ?? null,
    write: async (uid, value) => saved.set(uid, JSON.parse(JSON.stringify(value))) },
    currentUid: () => 'a', requestId: () => uuid,
    invoke: async (name, data) => { calls.push({ name, ...data }); return invoke(name, data); } };
  return { client: new GardenOperationsClient(dependencies), dependencies, saved, calls };
}
const waterReply = (id, status = 'rewarded') => ({ status, requestId: id,
  result: { status: status === 'already_watered' ? 'already' : 'rewarded', day: '2026-10-15', xpAwarded: 2, seedsAwarded: 0 } });
const assessmentReply = id => ({ status: 'already_applied', attemptId: id, result: { xpAwarded: 10, seedsAwarded: 5 } });
const failure = () => { throw Object.assign(new Error('synthetic outage'), { code: 'functions/unavailable' }); };

test('same in-flight watering promise, durable ID before transport, one request', async () => {
  let finish;
  const h = setup(async (_, data) => { assert.equal(h.saved.get('a').wateringRequestId, data.requestId); return new Promise(resolve => { finish = resolve; }); });
  const first = h.client.water('a'); const second = h.client.water('a');
  assert.equal(first, second);
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  finish(waterReply(uuid)); assert.equal((await first).status, 'confirmed');
  assert.equal(h.calls.length, 1); assert.equal(h.saved.get('a').wateringRequestId, undefined);
});
test('timeout/lost response survives a new client and retries the exact same ID', async () => {
  const h = setup(failure);
  assert.equal((await h.client.water('a')).status, 'pending');
  const restart = setup(async (_, data) => waterReply(data.requestId, 'replayed'), h.saved);
  await restart.client.hydrate('a'); assert.equal(restart.client.getStatus('a').wateringPending, true);
  assert.equal((await restart.client.water('a')).status, 'confirmed');
  assert.equal(restart.calls[0].requestId, h.calls[0].requestId);
});
test('already-watered acknowledgment clears the intent without claiming a new reward', async () => {
  const h = setup(async (_, data) => waterReply(data.requestId, 'already_watered'));
  const result = await h.client.water('a'); assert.equal(result.status, 'already');
  assert.match(result.message, /no extra XP/); assert.equal(h.saved.get('a').wateringRequestId, undefined);
});
test('storage failure prevents transport; malformed stored state is not reset', async () => {
  const h = setup(failure);
  h.dependencies.storage.write = async () => { throw Error('disk failure'); };
  assert.equal((await h.client.water('a')).status, 'pending'); assert.equal(h.calls.length, 0);
  const bad = new Map([['a', { version: 1, wateringRequestId: 'corrupt', assessmentAttemptIds: [] }]]);
  const malformed = setup(failure, bad);
  await malformed.client.water('a'); assert.equal(malformed.calls.length, 0);
  assert.equal(bad.get('a').wateringRequestId, 'corrupt');
});
test('unrecognized acknowledgment cannot clear pending request or claim success', async () => {
  for (const reply of [{}, waterReply('wrong-id'), { ...waterReply(uuid), result: { status: 'rewarded', day: '2026-10-15', xpAwarded: 999, seedsAwarded: 0 } }]) {
    const h = setup(async () => reply);
    assert.equal((await h.client.water('a')).status, 'pending'); assert.equal(h.saved.get('a').wateringRequestId, uuid);
  }
});
test('session ownership is checked before persistence and again before invocation', async () => {
  const h = setup(failure);
  assert.equal((await h.client.water('b')).status, 'blocked'); assert.equal(h.calls.length, 0);
  h.dependencies.storage.write = async (uid, value) => { h.saved.set(uid, value); h.dependencies.currentUid = () => 'b'; };
  assert.equal((await h.client.water('a')).status, 'blocked'); assert.equal(h.calls.length, 0);
});
test('pending assessment persists and retry only visits explicitly recorded attempts', async () => {
  const h = setup(failure);
  assert.equal((await h.client.confirmAssessment('a', 'lesson_a_1')).status, 'pending');
  const restart = setup(async (_, data) => assessmentReply(data.attemptId), h.saved);
  await restart.client.hydrate('a'); assert.equal(restart.client.getStatus('a').pendingAssessmentCount, 1);
  await restart.client.retryAssessments('a');
  assert.equal(restart.calls.length, 1); assert.equal(restart.calls[0].attemptId, 'lesson_a_1');
  assert.equal(restart.client.getStatus('a').pendingAssessmentCount, 0);
});
test('trigger witness race remains pending; review failures remain unconfirmed', async () => {
  for (const [reason, expected] of [['trusted_submission_witness_required', 'pending'], ['attempt_before_activation', 'blocked']]) {
    const h = setup(() => { throw { code: 'functions/failed-precondition', details: { reason } }; });
    assert.equal((await h.client.confirmAssessment('a', 'lesson_a_1')).status, expected);
    assert.equal(h.saved.get('a').assessmentAttemptIds.length, 1);
  }
});
test('overlapping assessment and watering persistence does not lose either pending intent', async () => {
  const h = setup(failure);
  await Promise.all([h.client.water('a'), h.client.confirmAssessment('a', 'lesson_a_1'), h.client.confirmAssessment('a', 'lesson_a_2')]);
  const saved = h.saved.get('a'); assert.equal(saved.wateringRequestId, uuid);
  assert.deepEqual(saved.assessmentAttemptIds.sort(), ['lesson_a_1', 'lesson_a_2']);
});
for (const local of [false, true]) {
  test(`Garden mount/focus starts one initialization and preserves refresh policy; local=${local}`, async () => {
    const effects = [], focus = []; let loads = 0;
    const imports = {
      'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
      react: { useState: value => [value, () => {}], useRef: current => ({ current }),
        useCallback: fn => fn, useEffect: fn => effects.push(fn) },
      'react-native': { StyleSheet: { create: value => value } },
      '@react-navigation/native': { useFocusEffect: fn => focus.push(fn), useNavigation: () => ({}) },
      '@spartan-g/shared-services': { useAuthStore: select => select({ session: { uid: 'a' } }),
        gardenService: { getOrCreateGarden: async () => { loads++; return { studentId: 'a' }; } },
        assessmentService: { getInProgressAttemptsByStudent: async () => [], getAttemptsByStudent: async () => [] } },
      '@spartan-g/shared-ui': { lightColors: {} }, '@expo/vector-icons': {},
      './components/GardenHeroScene': {}, '../../development/LocalGardenRewardStatus': {},
      '@spartan-g/shared-services/src/config/local-emulators': { localEmulators: { enabled: local } },
      '@spartan-g/shared-services/src/services/local-garden-operations': { getLocalGardenOperations: () => ({
        getStatus: () => ({ wateringPending: false, waterMessage: '' }), subscribe: () => () => {}, hydrate: async () => {} }) },
    };
    load('apps/mobile/src/screens/student/GardenScreen.tsx', imports).GardenScreen();
    effects.forEach(effect => effect()); focus.forEach(effect => effect());
    await Promise.resolve(); assert.equal(loads, 1, 'First focus must not race two create-if-absent operations');
    focus.forEach(effect => effect()); await Promise.resolve();
    assert.equal(loads, local ? 2 : 1, 'Only the new local path reloads Garden on later focus');
  });
  test(`actual submitAttempt preserves persistence/risk and submission success; local=${local}`, async () => {
    const updates = [], rewards = [], legacy = [];
    const imports = {
      '@spartan-g/shared-types': { evaluateAssessmentRisk: answers => {
        assert.equal(answers.q1, 'synthetic'); return { overallRiskLevel: 'low', overallRiskScore: 2, riskFlags: [] };
      } },
      '../firebase/firestore': { serverTimestamp: () => 'trusted-sentinel' },
      '../repositories/assessment-attempt.repository': { assessmentAttemptRepository: { update: async (...args) => updates.push(args) } },
      './garden.service': { gardenService: { recordCheckIn: async uid => legacy.push(uid) } },
      '../config/local-emulators': { localEmulators: { enabled: local } },
      './local-garden-operations': { getLocalGardenOperations: () => ({ confirmAssessment: async (...args) => { rewards.push(args); throw Error('backend offline'); } }) },
    };
    for (const name of ['assessment', 'assessment-template', 'assessment-question', 'assessment-response']) imports[`../repositories/${name}.repository`] = {};
    imports['./risk-alert.service'] = {}; imports['./assessment-override.service'] = {};
    const service = load('packages/shared-services/src/services/assessment.service.ts', imports).assessmentService;
    service.getAttempt = async () => ({ id: 'lesson_a_1', assessmentId: 'lesson', studentId: 'a', status: 'in_progress', answers: [] });
    await service.submitAttempt('lesson_a_1', [{ questionId: 'q1', value: 'synthetic' }]);
    assert.equal(updates.length, 1); assert.equal(updates[0][1].status, 'submitted');
    assert.equal(updates[0][1].overallRiskLevel, 'low'); assert.equal(updates[0][1].overallRiskScore, 2);
    assert.equal(updates[0][1].submittedAt, 'trusted-sentinel');
    assert.equal(legacy.length, local ? 0 : 1); assert.equal(rewards.length, local ? 1 : 0);
    service.getAttempt = async () => ({ status: 'submitted' });
    await service.submitAttempt('historical_a_1', []); assert.equal(updates.length, 1);
    assert.equal(rewards.length, local ? 1 : 0, 'Already-submitted early return never schedules historical recovery');
  });
}
