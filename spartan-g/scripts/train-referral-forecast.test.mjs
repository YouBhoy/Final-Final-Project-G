import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./train-referral-forecast.mjs', import.meta.url));
test('offline training exports a reproducible development-only model and rejects unsafe evaluation dates', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'referral-prototype-test-'));
  try {
    const input = join(folder, 'audit.json'), output = join(folder, 'model.json');
    const audit = { asOf: '2026-10-27', quality: {}, weekly: Array.from({ length: 16 }, (_, i) => ({
      weekStart: new Date(Date.UTC(2026, 5, 29 + i * 7)).toISOString().slice(0, 10), requests: i,
      completeCalendarWeek: true, firstObservedWeek: i === 0,
    })) };
    await writeFile(input, `\uFEFF${JSON.stringify(audit)}`);
    const run = args => spawnSync(process.execPath, [script, `--input=${input}`, `--output=${output}`, ...args], { encoding: 'utf8' });
    const result = run(['--data-kind=development']);
    assert.equal(result.status, 0, result.stderr);
    const model = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(model.status, 'ready');
    assert.equal(model.productionEnabled, false);
    assert.equal(model.trainingSeries.length, 15);
    assert.equal(model.dataKind, 'development');
    assert.ok(model.model.coefficients.every(Number.isFinite));
    assert.equal(model.evaluation.length, model.metrics.testWeeks);
    assert.equal(run([]).status, 1, 'explicit development provenance required');
    audit.weekly.push({ weekStart: '2026-10-26', requests: 2, completeCalendarWeek: true, firstObservedWeek: false });
    await writeFile(input, JSON.stringify(audit));
    const invalid = run(['--data-kind=development']);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /unfinished weeks/);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), model, 'invalid input does not overwrite a saved model');
  } finally {
    const target = resolve(folder);
    if (!target.startsWith(`${resolve(tmpdir())}${sep}`) || !basename(target).startsWith('referral-prototype-test-')) {
      throw new Error('Refusing cleanup outside the dedicated test directory.');
    }
    await rm(target, { recursive: true, force: true });
  }
});
