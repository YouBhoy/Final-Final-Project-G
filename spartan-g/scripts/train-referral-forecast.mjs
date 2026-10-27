/** Train/export the same prototype used by the dashboard, using an aggregate audit JSON.
 * No Firebase credentials, network calls, identities, database reads or writes.
 * node scripts/train-referral-forecast.mjs --input=../tmp/referral-history.json --output=../tmp/referral-forecast-prototype.json --data-kind=development
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
try {
  const inputPath = option('input'), outputPath = option('output');
  if (!inputPath || !outputPath || option('data-kind') !== 'development') throw new Error('Specify --input=... --output=... --data-kind=development. Production use is not supported.');
  if (resolve(inputPath) === resolve(outputPath)) throw new Error('Output must not overwrite the input audit.');
  const audit = JSON.parse((await readFile(inputPath, 'utf8')).replace(/^\uFEFF/, ''));
  if (!Array.isArray(audit.weekly) || !/^\d{4}-\d{2}-\d{2}$/.test(audit.asOf ?? '')) throw new Error('Input must be an aggregate referral-history audit JSON with asOf and weekly fields.');
  const cutoff = Date.parse(`${audit.asOf}T00:00:00+08:00`) + 86400000;
  if (!Number.isFinite(cutoff) || new Date(cutoff - 86400000 + 8 * 3600000).toISOString().slice(0, 10) !== audit.asOf) throw new Error('Invalid audit asOf date.');
  const weeks = audit.weekly.filter(row => row.completeCalendarWeek === true && row.firstObservedWeek === false)
    .map(row => ({ weekStart: row.weekStart, requests: row.requests }));
  if (weeks.some(row => Date.parse(`${row.weekStart}T00:00:00+08:00`) + 7 * 86400000 > cutoff)) throw new Error('Audit includes unfinished weeks as complete.');
  const source = await readFile(new URL('../packages/shared-types/src/utils/referralForecast.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  const { evaluateReferralForecast } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const quality = audit.quality ?? {};
  const blocked = ['missingCreationDates', 'invalidCreationDates', 'conflictingCreationDates'].some(key => Number(quality[key]) > 0);
  const result = evaluateReferralForecast(weeks, blocked ? 'Correct missing, invalid or conflicting request dates before training.' : undefined);
  const artifact = { artifactVersion: 2, sourceAsOf: audit.asOf, dataKind: 'development', productionEnabled: false,
    featureOrder: ['previous_week_requests', 'two_weeks_ago_requests'], trainingSeries: weeks,
    method: 'Ridge reference plus ridge/Poisson/fitted-smoothing comparison with separate earlier validation; same later expanding-window backtest for all methods and benchmarks.',
    assumptions: ['The first observed week and unfinished weeks are excluded.', 'Zero-count gaps are assumed observations for this test-data experiment; logging completeness is unverified.',
      'Metrics describe test data, not real student demand.'], ...result };
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: result.status, weeks: result.weeks, metrics: result.metrics, forecast: result.forecast, output: resolve(outputPath) }, null, 2));
  if (result.status !== 'ready') process.exitCode = 2;
} catch (error) { console.error(`Prototype training failed: ${error.message}`); process.exitCode = 1; }
