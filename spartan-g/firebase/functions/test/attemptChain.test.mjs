import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { analyzeChain, auditAttemptChains } from '../../../scripts/audit-attempt-chains.mjs';

/** Load the TypeScript helper the client uses, transpiled with the repo's esbuild. */
const repoRequire = createRequire(new URL('../../../package.json', import.meta.url));
const { transformSync } = repoRequire('esbuild');
const source = readFileSync(fileURLToPath(new URL('../../../packages/shared-types/src/utils/attempt-chain.ts', import.meta.url)), 'utf8');
const js = transformSync(source, { loader: 'ts', format: 'esm' }).code;
const { analyzeAttemptChain, planNextAttempt } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

const A = 'asm1';
const S = 'stu1';
const att = (n, status = 'submitted', extra = {}) => ({ id: `${A}_${S}_${n}`, attemptNumber: n, status, ...extra });
const legacy = (id, n, status = 'submitted') => ({ id, attemptNumber: n, status });

// ─── Analysis ───────────────────────────────────────────────────
test('a clean 1..n chain has no issues', () => {
  const a = analyzeAttemptChain(A, S, [att(1), att(2, 'graded'), att(3)]);
  assert.equal(a.clean, true);
  assert.equal(a.highest, 3);
  assert.equal(a.finishedCount, 3);
});

test('flags ids off the scheme, number mismatches, gaps and duplicates', () => {
  assert.deepEqual(analyzeAttemptChain(A, S, [att(1), legacy('rand123', 2)]).issues, ['id_mismatch']);
  assert.deepEqual(analyzeAttemptChain(A, S, [att(1), att(2, 'submitted', { attemptNumber: 7 })]).issues.sort(), ['gap', 'number_mismatch']);
  assert.ok(analyzeAttemptChain(A, S, [att(1), att(2), att(4)]).issues.includes('gap'));
  const dup = analyzeAttemptChain(A, S, [att(1), legacy('other', 1)]);
  assert.ok(dup.issues.includes('duplicate_number') || dup.issues.includes('id_mismatch'));
  assert.equal(analyzeAttemptChain(A, S, [att(1), { id: `${A}_${S}_2` }]).issues.includes('number_mismatch'), true, 'missing attemptNumber field');
});

test('the audit script and the client helper analyze every fixture identically', () => {
  const fixtures = [
    [], [att(1)], [att(1), att(2), att(3)], [att(1), att(2), att(4)], [att(1), legacy('rand', 2)],
    [att(1), att(2, 'submitted', { attemptNumber: 5 })], [att(1), att(2, 'in_progress')], [legacy('a', 1), legacy('b', 1)],
    [att(1), att(2), att(3), legacy('old', 4)], [{ id: `${A}_${S}_1` }],
  ];
  for (const fixture of fixtures) {
    const client = analyzeAttemptChain(A, S, fixture);
    const script = analyzeChain(A, S, fixture);
    assert.deepEqual(script, client, JSON.stringify(fixture));
  }
});

// ─── Next attempt: highest + 1, not count + 1 ───────────────────
test('the next number is the highest existing number + 1', () => {
  const clean = planNextAttempt(A, S, [att(1), att(2)], 5);
  assert.deepEqual([clean.ok, clean.attemptNumber, clean.attemptId], [true, 3, `${A}_${S}_3`]);
  assert.equal(planNextAttempt(A, S, [], 3).attemptId, `${A}_${S}_1`);
  // Count is 3 but the highest is 5 (gap): count + 1 would have picked the existing id ..._4... and 6 is what is next.
  const gap = planNextAttempt(A, S, [att(1), att(2), att(5)], 9, { predecessor: 'tolerant' });
  assert.equal(gap.attemptNumber, 6);
});

test('the limit counts finished attempts only', () => {
  assert.equal(planNextAttempt(A, S, [att(1), att(2), att(3), att(4)], 4).reason, 'limit');
  assert.equal(planNextAttempt(A, S, [att(1), att(2), att(3), att(4)], 6).attemptNumber, 5, 'an override of 6 allows attempt 5');
  const withUnfinished = planNextAttempt(A, S, [att(1), att(2, 'in_progress')], 2);
  assert.equal(withUnfinished.reason, 'broken_chain', 'attempt 2 is unfinished, so attempt 3 may not start');
});

test('strict mode (the deployed rule) refuses a missing predecessor; tolerant mode allows it', () => {
  const chain = [att(1), att(2), att(3), legacy('old-random-id', 4)];
  const strict = planNextAttempt(A, S, chain, 10, { predecessor: 'strict' });
  assert.deepEqual([strict.ok, strict.reason], [false, 'broken_chain']);
  assert.match(strict.detail, /attempt 4 does not exist/);
  const tolerant = planNextAttempt(A, S, chain, 10, { predecessor: 'tolerant' });
  assert.deepEqual([tolerant.ok, tolerant.attemptNumber], [true, 5]);
});

test('a number that has run past the limit while attempts remain is reported as a broken chain', () => {
  // 4 finished attempts of a limit of 5, but numbered 1,2,3,6: next would be 7 > 5.
  const result = planNextAttempt(A, S, [att(1), att(2), att(3), att(6)], 5, { predecessor: 'tolerant' });
  assert.deepEqual([result.ok, result.reason], [false, 'broken_chain']);
});

// ─── The audit script is read-only and flags the right chains ───
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Tests require the Firestore emulator; never run against live data.');
initializeApp({ projectId: 'demo-spartan-booking' });
const db = getFirestore();

test('the audit script flags broken chains, leaves clean ones alone and writes nothing', async () => {
  const id = `audit_${Date.now()}`;
  const a = `${id}_a`;
  const put = (docId, data) => db.doc(`assessment_attempts/${docId}`).set({ assessmentId: a, ...data });
  await Promise.all([
    // clean chain
    put(`${a}_clean_1`, { studentId: 'clean', attemptNumber: 1, status: 'submitted' }),
    put(`${a}_clean_2`, { studentId: 'clean', attemptNumber: 2, status: 'graded' }),
    // legacy random id
    put(`${a}_legacy_1`, { studentId: 'legacy', attemptNumber: 1, status: 'submitted' }),
    put('legacy-random-id', { studentId: 'legacy', attemptNumber: 2, status: 'submitted' }),
    // gap
    put(`${a}_gap_1`, { studentId: 'gap', attemptNumber: 1, status: 'submitted' }),
    put(`${a}_gap_3`, { studentId: 'gap', attemptNumber: 3, status: 'submitted' }),
    // number mismatch
    put(`${a}_mm_1`, { studentId: 'mm', attemptNumber: 9, status: 'submitted' }),
  ]);
  const before = (await db.collection('assessment_attempts').get()).docs.map(d => [d.id, JSON.stringify(d.data())]).sort();
  const report = await auditAttemptChains(db);
  const mine = report.chains.filter(c => c.assessmentId === a);
  const byStudent = Object.fromEntries(mine.map(c => [c.studentId, c.issues.sort()]));
  assert.deepEqual(byStudent, { clean: [], gap: ['gap'], legacy: ['id_mismatch'], mm: ['gap', 'number_mismatch'] });
  const after = (await db.collection('assessment_attempts').get()).docs.map(d => [d.id, JSON.stringify(d.data())]).sort();
  assert.deepEqual(after, before, 'the audit must not modify any document');
});
