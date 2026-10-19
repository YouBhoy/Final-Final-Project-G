const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/garden-phase5');
const json = file => JSON.parse(fs.readFileSync(path.join(docs, file), 'utf8').replace(/^\uFEFF/, ''));
for (const name of ['platform-tests.tap', 'client-tests.tap', 'mobile-typescript.txt', 'cloud-inspection-with-iam.txt']) {
  const file = path.join(docs, name), bytes = fs.readFileSync(file);
  if (bytes[0] === 255 && bytes[1] === 254) fs.writeFileSync(file, bytes.subarray(2).toString('utf16le'));
}
const run = json(fs.readdirSync(docs).filter(name => /^run-.*\.json$/.test(name)).sort().at(-1));
const groups = [];
for (const result of run.results.filter(r => /tests$/.test(r.name))) {
  const text = fs.readFileSync(path.join(docs, result.log), 'utf8');
  groups.push({ name: result.name, log: result.log, exitCode: result.code, tests: Number(text.match(/^# tests (\d+)/m)?.[1]), pass: Number(text.match(/^# pass (\d+)/m)?.[1]), fail: Number(text.match(/^# fail (\d+)/m)?.[1]), skipped: Number(text.match(/^# skipped (\d+)/m)?.[1]) });
}
for (const name of ['client-tests.tap', 'platform-tests.tap']) {
  const text = fs.readFileSync(path.join(docs, name), 'utf8');
  groups.push({ name, log: name, tests: Number(text.match(/^# tests (\d+)/m)?.[1]), pass: Number(text.match(/^# pass (\d+)/m)?.[1]), fail: Number(text.match(/^# fail (\d+)/m)?.[1]), skipped: Number(text.match(/^# skipped (\d+)/m)?.[1]) });
}
if (groups.some(g => !g.tests || g.tests !== g.pass || g.fail || g.skipped)) throw new Error('Incomplete or failing test summary');
const runtime = path.join(os.tmpdir(), 'spartan-g-garden-phase5');
const emulatorLog = fs.readFileSync(path.join(runtime, 'firebase-emulators.log'), 'utf8');
const state = JSON.parse(fs.readFileSync(path.join(runtime, 'state.json'), 'utf8'));
const runtimeEvidence = { node22UsedByFunctions: emulatorLog.includes('Using node@22 from host'), hostOnly: state.hostOnly, syntheticProject: state.projectId,
  exportsLine: emulatorLog.split(/\r?\n/).find(line => /Loaded functions definitions/.test(line))?.replace(/\u001b\[[0-9;]*m/g, ''),
  healthFailureCount: fs.existsSync(path.join(runtime, 'health-events.jsonl')) ? fs.readFileSync(path.join(runtime, 'health-events.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).length : 0 };
const result = { completedAt: new Date().toISOString(), recommendation: 'NOT READY for production deployment or activation', localValidation: 'PASS', node: run.node, node22Validated: run.node22Validated, backendTypeChecksPassed: run.results.filter(r => !/tests$/.test(r.name)).every(r => r.code === 0), groups, totalPass: groups.reduce((sum, g) => sum + g.pass, 0), totalFail: 0, totalSkipped: 0, runtimeEvidence, health: json('platform-health-timing.json'), mobile: json('final-checks.json'), releaseArtifact: json('release-module-audit.json'), noDeployments: true, productionDocumentAccess: false, productionMetadataReadsOnly: true };
fs.writeFileSync(path.join(docs, 'validation-summary.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ totalPass: result.totalPass, node: result.node, runtimeEvidence }, null, 2));
