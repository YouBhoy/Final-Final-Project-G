// Local-only runner: cached official emulator, synthetic projects, no CLI/login/ADC.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/garden-backend-phase2');
const original = path.join(root, 'docs/sdk53-firestore-restoration');
const java = process.env.SPARTAN_RULES_JAVA || 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe';
const jar = path.join(os.tmpdir(), 'spartan-g-firestore-restoration-tools/cloud-firestore-emulator-v1.22.0.jar');
const expectedHash = '9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let emulator;
const handles = [];

function env(project, port) {
  return { ...process.env, GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project,
    FIREBASE_CONFIG: JSON.stringify({ projectId: project }),
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`, GOOGLE_APPLICATION_CREDENTIALS: '',
    FIREBASE_TOKEN: '', CLOUDSDK_AUTH_ACCESS_TOKEN: '', FIREBASE_AUTH_EMULATOR_HOST: '',
    GOOGLE_OAUTH_ACCESS_TOKEN: '', GCE_METADATA_HOST: '127.0.0.1:1' };
}
async function command(args, environment, name) {
  const filename = path.join(docs, `${name}-${stamp}.log`);
  const fd = fs.openSync(filename, 'wx');
  const output = [];
  try {
    const code = await new Promise((resolve, reject) => {
      const child = cp.spawn(process.execPath, args, { cwd: root, env: environment,
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
        fs.writeSync(fd, bytes); output.push(bytes);
      });
      child.once('error', reject); child.once('exit', resolve);
    });
    const summary = Buffer.concat(output).toString('utf8').split('\n').filter(line => /^# (tests|pass|fail|skipped) /.test(line));
    console.log(`${name}: ${code === 0 ? 'PASS' : 'FAIL'} ${summary.join('; ')} [${path.basename(filename)}]`);
    if (code !== 0) throw new Error(`${name} failed; see ${path.basename(filename)}`);
  } finally { fs.closeSync(fd); }
}
async function stop() {
  if (emulator && emulator.exitCode === null && emulator.signalCode === null) {
    const exited = new Promise(resolve => emulator.once('exit', resolve));
    emulator.kill(); await Promise.race([exited, sleep(5000)]);
    if (emulator.exitCode === null && emulator.signalCode === null) throw new Error('Could not confirm shutdown of this runner\'s emulator');
  }
  emulator = undefined;
  while (handles.length) fs.closeSync(handles.pop());
}
async function start(project, port) {
  if (!project.startsWith('demo-')) throw new Error('Synthetic project required');
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is occupied; no existing process will be stopped`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
  const out = fs.openSync(path.join(docs, `emulator-${port}-${stamp}.log`), 'wx'); handles.push(out);
  const err = fs.openSync(path.join(docs, `emulator-${port}-${stamp}.stderr.log`), 'wx'); handles.push(err);
  emulator = cp.spawn(java, ['-Xmx512m', '-Duser.language=en', '-jar', jar,
    '--host', '127.0.0.1', '--port', String(port), '--project_id', project,
    '--rules', path.join(original, 'candidate.rules')], {
    cwd: docs, env: env(project, port), windowsHide: true, stdio: ['ignore', out, err],
  });
  let startError;
  emulator.once('error', error => { startError = error; });
  for (let i = 0; i < 120; i++) {
    if (startError) throw startError;
    if (emulator.exitCode !== null) throw new Error('Emulator exited during startup');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      if (response.status < 500) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('Emulator readiness timeout');
}

(async () => {
  if (!fs.existsSync(java) || !fs.existsSync(jar) || hash(jar) !== expectedHash) {
    throw new Error('Existing verified Firestore emulator 1.22.0 / Java 21+ required; nothing will be installed');
  }
  fs.mkdirSync(docs, { recursive: true });
  await command(['functions/node_modules/typescript/bin/tsc', '-p', 'functions/tsconfig.json'], process.env, 'backend-build');
  if (!process.argv.includes('--rewards-only')) {
    await command(['functions/node_modules/typescript/bin/tsc', '-p', 'functions/tsconfig.garden.json'], process.env, 'domain-typecheck');
    await command(['--test', '--test-reporter=tap', 'functions/tests/garden-domain.test.cjs', 'packages/shared-services/tests/garden-loading.test.cjs'], process.env, 'domain-tests');
  }
  await start('demo-spartan-g-garden-phase2', 18082);
  await command(['--test', '--test-reporter=tap', '--test-concurrency=1', 'functions/tests/assessment-rewards.test.cjs'], env('demo-spartan-g-garden-phase2', 18082), 'assessment-rewards');
  await stop();

  if (process.argv.includes('--rewards-only')) return;

  // Run an exact copy of the existing suite so its artifact writes stay in Phase 2 docs.
  const retrieval = fs.readdirSync(original).filter(name => /^retrieval-.*\.json$/.test(name)).sort().at(-1);
  const metadata = JSON.parse(fs.readFileSync(path.join(original, retrieval), 'utf8'));
  for (const filename of ['rules.test.cjs', 'candidate.rules', retrieval, metadata.baselineFile]) {
    const target = path.join(docs, filename);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(original, filename), target, fs.constants.COPYFILE_EXCL);
    if (hash(target) !== hash(path.join(original, filename))) throw new Error(`Rule regression fixture drift: ${filename}`);
  }
  await start('demo-spartan-g-restoration', 18081);
  await command(['--test', '--test-reporter=tap', '--test-concurrency=1', path.join(docs, 'rules.test.cjs')], env('demo-spartan-g-restoration', 18081), 'existing-security-regression');
  await stop();
  fs.writeFileSync(path.join(docs, `run-${stamp}.json`), JSON.stringify({ completedAt: new Date().toISOString(),
    node: process.version, emulator: '1.22.0', jarSha256: expectedHash,
    projects: ['demo-spartan-g-garden-phase2', 'demo-spartan-g-restoration'],
    productionAccess: false, allCommandsPassed: true }, null, 2) + '\n', { flag: 'wx' });
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  try { await stop(); } catch (error) { console.error(error.message); process.exitCode = 1; }
});
