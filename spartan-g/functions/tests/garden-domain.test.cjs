const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const domainRoot = path.join(root, 'functions/src/garden');
const cache = new Map();

// Same-realm transpilation follows the existing shared-services test convention.
// Imports are allowlisted: no Firebase SDK, network, credentials or cloud access.
function evaluate(filename, imports, extras = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports, Date, console) {\n${outputText}\n})`, { filename })(
    imports, module, module.exports, extras.Date ?? Date,
    extras.console ?? { error: (...args) => assert.fail(`Unexpected service error: ${args[0]}`) },
  );
  return module.exports;
}

function loadDomain(name) {
  const filename = path.resolve(domainRoot, `${name}.ts`);
  assert.equal(path.dirname(filename), domainRoot, 'Domain imports stay in the isolated directory');
  if (!cache.has(filename)) {
    cache.set(filename, evaluate(filename, imported => {
      assert.match(imported, /^\.\/[a-z]+$/);
      return loadDomain(imported.slice(2));
    }));
  }
  return cache.get(filename);
}

const { parseUtcDay, utcDayFromDate, isPreviousUtcDay } = loadDomain('dates');
const {
  parseGardenState, parseGardenDocument, parseAssessmentRewardRequest,
  parseWateringRequest, GardenValidationError,
} = loadDomain('validation');
const {
  GARDEN_POLICY, createInitialGardenState, calculateAssessmentReward, calculateWateringReward,
} = loadDomain('policy');
const { classifyReceipt } = loadDomain('operations');
const uid = 'fixture-student';
const instant = new Date('2026-10-15T12:00:00.000Z');
const day = '2026-10-15';
const state = (overrides = {}) => ({ ...createInitialGardenState(uid), ...overrides });

test('initial state and policy exactly retain existing fields and amounts', () => {
  assert.deepEqual(GARDEN_POLICY, {
    assessmentXp: 10, assessmentSeeds: 5, wateringXp: 2, wateringSeedCost: 0,
    levelThresholdMultiplier: 50,
  });
  assert.equal(Object.isFrozen(GARDEN_POLICY), true);
  assert.deepEqual(createInitialGardenState(uid), {
    studentId: uid, level: 1, xp: 0, seeds: 0, streakCount: 0,
    lastCheckInDate: '', lastWateredDate: '',
  });
});

for (const [label, previous, streak, expected] of [
  ['first assessment', '', 0, 1],
  ['same UTC day', day, 4, 4],
  ['consecutive day', '2026-10-14', 4, 5],
  ['gap', '2026-10-12', 4, 1],
  ['legacy future date retains existing reset behavior', '2026-10-16', 4, 1],
]) {
  test(`assessment: ${label}`, () => {
    const result = calculateAssessmentReward(state({ lastCheckInDate: previous, streakCount: streak }), instant);
    assert.equal(result.garden.xp, 10);
    assert.equal(result.garden.seeds, 5);
    assert.equal(result.garden.streakCount, expected);
    assert.equal(result.garden.lastCheckInDate, day);
    assert.equal(result.garden.lastWateredDate, '');
  });
}

test('multiple same-day assessments each receive rewards with one streak increase', () => {
  let garden = state({ streakCount: 3, lastCheckInDate: '2026-10-14' });
  garden = calculateAssessmentReward(garden, instant).garden;
  garden = calculateAssessmentReward(garden, instant).garden;
  assert.deepEqual([garden.xp, garden.seeds, garden.streakCount], [20, 10, 4]);
});

for (const [label, level, xp, gainKind, expectedLevel, expectedXp] of [
  ['below threshold', 1, 39, 'assessment', 1, 49],
  ['exact threshold', 1, 40, 'assessment', 2, 0],
  ['remainder', 2, 95, 'assessment', 3, 5],
  ['one level only for large legacy XP', 1, 500, 'assessment', 2, 460],
  ['watering exact threshold', 1, 48, 'water', 2, 0],
  ['watering one level only', 1, 500, 'water', 2, 452],
]) {
  test(`level progression: ${label}`, () => {
    const input = state({ level, xp });
    const result = gainKind === 'water'
      ? calculateWateringReward(input, instant) : calculateAssessmentReward(input, instant);
    assert.deepEqual([result.garden.level, result.garden.xp], [expectedLevel, expectedXp]);
    assert.equal(result.leveledUp, expectedLevel !== level);
  });
}

test('watering grants two XP at zero seeds and leaves assessment streak/date unchanged', () => {
  const garden = state({ streakCount: 8, lastCheckInDate: '2026-10-13' });
  const result = calculateWateringReward(garden, instant);
  assert.equal(result.status, 'rewarded');
  assert.equal(result.xpAwarded, 2);
  assert.equal(result.seedsAwarded, 0);
  assert.equal(result.garden.seeds, 0);
  assert.equal(result.garden.streakCount, 8);
  assert.equal(result.garden.lastCheckInDate, '2026-10-13');
  assert.equal(result.garden.lastWateredDate, day);
});

test('same-day watering is unchanged, including XP already above a level threshold', () => {
  const garden = state({ xp: 500, lastWateredDate: day });
  assert.deepEqual(calculateWateringReward(garden, instant), { status: 'already', day, garden });
});

test('watering resets at UTC midnight, even one millisecond after the preceding watering', () => {
  const first = calculateWateringReward(state(), new Date('2026-10-15T23:59:59.999Z'));
  const second = calculateWateringReward(first.garden, new Date('2026-10-16T00:00:00.000Z'));
  assert.equal(second.status, 'rewarded');
  assert.equal(second.garden.xp, 4);
  assert.equal(second.garden.lastWateredDate, '2026-10-16');
});

test('calculations do not mutate input or replace existing extra document fields', () => {
  const garden = Object.freeze(state({ legacyAchievement: 'retained', createdAt: { seconds: 1, nanoseconds: 0 } }));
  const before = JSON.stringify(garden);
  calculateAssessmentReward(garden, instant);
  calculateWateringReward(garden, instant);
  assert.equal(JSON.stringify(garden), before);
  assert.equal(garden.legacyAchievement, 'retained');
});

for (const [previous, current] of [
  ['2024-02-28', '2024-02-29'], ['2024-02-29', '2024-03-01'],
  ['2025-02-28', '2025-03-01'], ['2025-12-31', '2026-01-01'],
]) {
  test(`UTC consecutive dates across calendar boundary ${previous} to ${current}`, () => {
    assert.equal(isPreviousUtcDay(parseUtcDay(previous), parseUtcDay(current)), true);
    const result = calculateAssessmentReward(state({ lastCheckInDate: previous, streakCount: 2 }), new Date(`${current}T00:00:00Z`));
    assert.equal(result.garden.streakCount, 3);
  });
}

test('UTC date policy uses the instant rather than its input timezone', () => {
  assert.equal(utcDayFromDate(new Date('2026-10-16T00:30:00+08:00')), day);
  assert.equal(isPreviousUtcDay(parseUtcDay(day), parseUtcDay(day)), false);
  assert.equal(isPreviousUtcDay(parseUtcDay('2026-10-13'), parseUtcDay(day)), false);
});

test('malformed, impossible and invalid-clock dates are rejected', () => {
  for (const value of [undefined, null, '', '2026-2-01', '2026-02-29', '2024-02-30', '2026-13-01', '2026-10-15T00:00:00Z']) {
    assert.throws(() => parseUtcDay(value), RangeError);
  }
  assert.throws(() => calculateAssessmentReward(state(), new Date(NaN)), RangeError);
  assert.throws(() => calculateWateringReward(state(), new Date(NaN)), RangeError);
});

test('Garden records require numeric, nonnegative safe integers and an owner-consistent ID', () => {
  for (const field of ['level', 'xp', 'seeds', 'streakCount']) {
    for (const value of [undefined, null, '1', -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => parseGardenState(state({ [field]: value }), uid), GardenValidationError);
    }
  }
  for (const invalid of [null, [], 'garden']) {
    assert.throws(() => parseGardenState(invalid, uid), GardenValidationError);
  }
  assert.throws(() => parseGardenState(state({ level: 0 }), uid), GardenValidationError);
  assert.throws(() => parseGardenState(state(), 'another-student'), GardenValidationError);
  assert.throws(() => parseGardenState(state({ id: 'another-student' }), uid), GardenValidationError);
  assert.throws(() => parseGardenState(state({ lastWateredDate: undefined }), uid), GardenValidationError);
  assert.throws(() => parseGardenState(state({ lastCheckInDate: 'bad' }), uid), GardenValidationError);
});

test('stored timestamps are required, while extra fields are only projected out and never rewritten', () => {
  const stamp = { seconds: 1_792_065_600, nanoseconds: 3 };
  const document = { ...state(), createdAt: stamp, updatedAt: stamp, id: uid, legacy: true };
  assert.deepEqual(parseGardenDocument(document, uid), { ...state(), createdAt: stamp, updatedAt: stamp });
  assert.equal(document.legacy, true);
  for (const value of [undefined, new Date(), { seconds: '1', nanoseconds: 0 }, { seconds: 1, nanoseconds: -1 }, { seconds: 1, nanoseconds: 1e9 }]) {
    assert.throws(() => parseGardenDocument({ ...document, updatedAt: value }, uid), GardenValidationError);
  }
});

test('unsafe arithmetic is rejected rather than silently rounding or normalizing data', () => {
  for (const overrides of [
    { xp: Number.MAX_SAFE_INTEGER }, { seeds: Number.MAX_SAFE_INTEGER },
    { level: Number.MAX_SAFE_INTEGER },
    { lastCheckInDate: '2026-10-14', streakCount: Number.MAX_SAFE_INTEGER },
  ]) {
    assert.throws(() => calculateAssessmentReward(state(overrides), instant), GardenValidationError);
  }
  assert.throws(() => calculateWateringReward(state({ xp: Number.MAX_SAFE_INTEGER }), instant), GardenValidationError);
});

test('future request parsers accept identity only and reject spoofed owners/reward fields', () => {
  assert.deepEqual(parseAssessmentRewardRequest({ attemptId: 'attempt-1' }), { attemptId: 'attempt-1' });
  assert.deepEqual(parseWateringRequest({ requestId: 'request-1' }), { requestId: 'request-1' });
  for (const parse of [parseAssessmentRewardRequest, parseWateringRequest]) {
    const identity = parse === parseWateringRequest ? { requestId: 'r' } : { attemptId: 'a' };
    for (const value of [null, {}, [], { ...identity, studentId: uid }, { ...identity, xp: 10 }, { ...identity, seeds: 5 }, { ...identity, rewardDay: day }]) {
      assert.throws(() => parse(value), GardenValidationError);
    }
  }
  for (const attemptId of ['', ' ', 'one/two', '.', '..']) {
    assert.throws(() => parseAssessmentRewardRequest({ attemptId }), GardenValidationError);
  }
});

const operation = (identity = { kind: 'assessment_reward', studentId: uid, attemptId: 'attempt-1' }) => ({
  operationId: 'synthetic-operation-id', identity, policyVersion: 'legacy-v1', rewardDay: parseUtcDay(day),
});
const receipt = (op, status) => ({ ...op, status, recordedAt: { seconds: 1, nanoseconds: 0 } });

test('receipt contracts distinguish new, pending, applied, review and already-watered outcomes', () => {
  const op = operation();
  assert.equal(classifyReceipt(op, null), 'new');
  assert.equal(classifyReceipt(op, receipt(op, 'pending')), 'resume_pending');
  assert.equal(classifyReceipt(op, { ...receipt(op, 'applied'), result: calculateAssessmentReward(state(), instant) }), 'replay_applied');
  assert.equal(classifyReceipt(op, { ...receipt(op, 'review_required'), reason: 'historical ambiguity' }), 'manual_review');
  const water = operation({ kind: 'watering', studentId: uid, requestId: 'request-1' });
  assert.equal(classifyReceipt(water, receipt(water, 'already_watered')), 'replay_already_watered');
  assert.throws(() => classifyReceipt(op, receipt(op, 'already_watered')), GardenValidationError);
});

test('matching receipt keys alone cannot authorize a conflicting identity or policy', () => {
  const op = operation();
  for (const conflicting of [
    { ...op, operationId: 'different-key' },
    { ...op, identity: { ...op.identity, studentId: 'another-student' } },
    { ...op, identity: { ...op.identity, attemptId: 'another-attempt' } },
    operation({ kind: 'watering', studentId: uid, requestId: 'attempt-1' }),
    { ...op, policyVersion: 'unapproved-v2' },
  ]) {
    assert.throws(() => classifyReceipt(op, receipt(conflicting, 'pending')), GardenValidationError);
  }
  const water = operation({ kind: 'watering', studentId: uid, requestId: 'r1' });
  const otherWater = operation({ kind: 'watering', studentId: uid, requestId: 'r2' });
  assert.throws(() => classifyReceipt(water, receipt(otherWater, 'pending')), GardenValidationError);
});

test('retry across UTC midnight replays the receipt instead of creating a second daily operation', () => {
  const op = operation({ kind: 'watering', studentId: uid, requestId: 'request-1' });
  const stored = { ...receipt(op, 'applied'), result: calculateWateringReward(state(), instant) };
  const retry = { ...op, rewardDay: parseUtcDay('2026-10-16') };
  assert.equal(classifyReceipt(retry, stored), 'replay_applied');
  assert.equal(stored.rewardDay, day);
});

// Differential oracle: run the unchanged production GardenService AND Repository.
// Only Firestore primitives are mocked. No Firebase runtime import is allowed.
function existingService(initial, now) {
  let document = initial ? { ...initial } : null;
  const calls = [];
  const timestamp = Object.freeze({ seconds: 1, nanoseconds: 0 });
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length === 0 ? [now.getTime()] : args)); }
    static now() { return now.getTime(); }
  }
  const collections = evaluate(path.join(root, 'packages/shared-types/src/constants/collections.ts'), name => assert.fail(name));
  const increment = amount => ({ increment: amount });
  const firestore = {
    getFirestoreDb: () => ({}),
    doc: (_db, collection, id) => {
      assert.equal(collection, 'student_gardens');
      assert.equal(id, uid);
      return { id };
    },
    getDoc: async () => ({ id: uid, exists: () => document !== null, data: () => ({ ...document }) }),
    setDoc: async (_ref, data) => { calls.push('create'); document = { ...data }; },
    updateDoc: async (_ref, patch) => {
      calls.push('update');
      for (const [key, value] of Object.entries(patch)) {
        document[key] = value && typeof value === 'object' && Object.hasOwn(value, 'increment')
          ? document[key] + value.increment : value;
      }
    },
    serverTimestamp: () => timestamp,
  };
  const { gardenRepository } = evaluate(path.join(root, 'packages/shared-services/src/repositories/garden.repository.ts'), name => {
    if (name === '@spartan-g/shared-types') return collections;
    if (name === '../firebase/firestore') return firestore;
    if (name === 'firebase/firestore') return { increment };
    assert.fail(`Unexpected repository import ${name}`);
  });
  const { gardenService } = evaluate(path.join(root, 'packages/shared-services/src/services/garden.service.ts'), name => {
    assert.equal(name, '../repositories/garden.repository');
    return { gardenRepository };
  }, { Date: FixedDate });
  return { gardenService, calls, read: () => parseGardenState(document, uid) };
}

test('initial Garden state matches the unchanged repository create payload', async () => {
  const h = existingService(null, instant);
  await h.gardenService.getOrCreateGarden(uid);
  assert.deepEqual(h.read(), createInitialGardenState(uid));
  assert.deepEqual(h.calls, ['create']);
});

test('assessment calculations match actual service/repository results in 180 scenarios', async () => {
  let count = 0;
  for (const level of [1, 2, 7]) {
    for (const xp of [0, level * 50 - 11, level * 50 - 10, level * 50 - 1, level * 50, level * 150]) {
      for (const seeds of [0, 9]) {
        for (const lastCheckInDate of ['', day, '2026-10-14', '2026-10-12', '2026-10-16']) {
          const garden = state({ level, xp, seeds, lastCheckInDate, streakCount: 3 });
          const h = existingService(garden, instant);
          await h.gardenService.recordCheckIn(uid);
          assert.deepEqual(h.read(), calculateAssessmentReward(garden, instant).garden);
          count++;
        }
      }
    }
  }
  assert.equal(count, 180);
});

test('watering calculations match actual service/repository results in 144 scenarios', async () => {
  let count = 0;
  for (const level of [1, 2, 7]) {
    for (const xp of [0, level * 50 - 3, level * 50 - 2, level * 50 - 1, level * 50, level * 150]) {
      for (const seeds of [0, 9]) {
        for (const lastWateredDate of ['', day, '2026-10-14', '2026-10-16']) {
          const garden = state({ level, xp, seeds, lastWateredDate, streakCount: 3, lastCheckInDate: '2026-10-14' });
          const h = existingService(garden, instant);
          const result = await h.gardenService.waterGarden(uid);
          const calculated = calculateWateringReward(garden, instant);
          assert.equal(result, calculated.status);
          assert.deepEqual(h.read(), calculated.garden);
          if (result === 'already') assert.deepEqual(h.calls, []);
          count++;
        }
      }
    }
  }
  assert.equal(count, 144);
});
