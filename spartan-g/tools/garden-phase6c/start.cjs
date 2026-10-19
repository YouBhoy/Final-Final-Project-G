// No Firebase login, deploy, cloud project or real account is used by this launcher.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const hostOnly = process.argv.includes('--host-only');
if (!hostOnly) throw new Error('Phase 6C permits host-only testing; no Android, firewall or Metro control.');
const safety = process.argv.includes('--safety');
const controlled = safety || process.argv.includes('--controlled');
const project = 'demo-spartan-g-garden-phase2';
const expectedRules = '4ec0f3c9bb399b9489c1d6ebf18f176ec81b9de3fbd20c3dee4fc5f370b7a5b1';
const tools = path.join(os.tmpdir(), 'spartan-g-local-firebase-tools-15.34.0');
const runtime = path.join(os.tmpdir(), 'spartan-g-garden-phase6c');
const docs = path.join(root, 'docs/garden-phase6c');
const backendRequire = createRequire(path.join(root, 'functions/package.json'));
const firewall = null; // Host-only mode never calls device functions.
const children = [];
const handles = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let healthServer;
let stopping = false;
let fixturesReady = false;
let hold = false;
let devicePoll;

async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', () => reject(new Error(`Port ${port} occupied; no service will be stopped`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
function child(command, args, env, label, cwd = runtime) {
  const fd = fs.openSync(path.join(runtime, `${label}.log`), 'a'); handles.push(fd);
  const processChild = cp.spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', fd, fd] });
  children.push(processChild);
  processChild.once('error', error => console.error(`${label}: ${error.message}`));
  return processChild;
}
async function probe() {
  try {
    const [auth, firestore, functions] = await Promise.all([
      fetch(`http://127.0.0.1:19099/emulator/v1/projects/${project}/config`, { signal: AbortSignal.timeout(15000) }),
      fetch(`http://127.0.0.1:18089/v1/projects/${project}/databases/(default)/documents/local_test_environment/ready`, {
        headers: { Authorization: 'Bearer owner' }, signal: AbortSignal.timeout(15000),
      }),
      fetch(`http://127.0.0.1:15001/${project}/us-central1/gardenLocalHealth`, {
        signal: AbortSignal.timeout(15000),
      }),
    ]);
    const functionHealth = functions.ok ? await functions.json() : null;
    return auth.ok && firestore.ok && (await firestore.json()).fields?.projectId?.stringValue === project
      && functionHealth?.ready === true && functionHealth.projectId === project && functionHealth.region === 'us-central1';
  } catch (error) {
    fs.appendFileSync(path.join(runtime, 'health-events.jsonl'), JSON.stringify({ at: new Date().toISOString(),
      reason: 'Local backend probe failed', error: error.name }) + '\n');
    return false;
  }
}
async function seed() {
  const { initializeApp, deleteApp } = backendRequire('firebase-admin/app');
  const { getAuth } = backendRequire('firebase-admin/auth');
  const { getFirestore, FieldValue, Timestamp } = backendRequire('firebase-admin/firestore');
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:18089';
  process.env.GCLOUD_PROJECT = project;
  const app = initializeApp({ projectId: project }, 'local-garden-fixtures');
  const db = getFirestore(app);
  const auth = getAuth(app);
  const accounts = [];
  for (const [fixture, uid, displayName] of [
    ['existing', 'local-garden-existing', 'Local Existing Student'],
    ['missing', 'local-garden-missing', 'Local New Student'],
    ['other', 'local-garden-other', 'Local Other Student'],
    ['automated', 'local-garden-init-test', 'Local Automated Student'],
  ]) {
    const email = `${fixture}@garden.example.invalid`;
    const password = crypto.randomBytes(24).toString('base64url');
    await auth.createUser({ uid, email, password, displayName, emailVerified: true });
    await db.doc(`users/${uid}`).create({ uid, email, displayName, role: 'student', isActive: true,
      campus: 'Local Test Campus', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await db.doc(`profiles/${uid}`).create({ uid, campus: 'Local Test Campus', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (fixture === 'existing' || fixture === 'other') {
      await db.doc(`student_gardens/${uid}`).create({ studentId: uid, level: fixture === 'existing' ? 3 : 2,
        xp: fixture === 'existing' ? 25 : 15, seeds: fixture === 'existing' ? 12 : 8,
        streakCount: fixture === 'existing' ? 2 : 1, lastCheckInDate: '', lastWateredDate: '',
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    accounts.push({ fixture, uid, email, password });
  }
  await db.doc('local_test_environment/ready').create({ projectId: project, rulesSha256: expectedRules });
  for (const operation of ['assessment_v1', 'watering_v1']) {
    await db.doc(`garden_reward_control/${operation}`).create({ enabled: true,
      policyVersion: 'legacy-v1', legacyClientRewardWritesBlocked: true });
  }
  if (controlled) {
    const { createControlledGardenRuntime, initializeGardenSwitch } = backendRequire('./lib/garden-production/activation');
    const { assertLocalRewardDatabase } = backendRequire('./lib/garden-rewards/local-safety');
    const policy = createControlledGardenRuntime(assertLocalRewardDatabase);
    for (const kind of ['assessment', 'watering', 'recovery']) await initializeGardenSwitch(db, policy, kind);
  }
  await db.doc('courses/local-course').create({ title: 'Synthetic Garden course', isPublished: true, isActive: true });
  await db.doc('assessments/local-lesson').create({ title: 'Local Garden check-in',
    courseId: 'local-course', facilitatorId: 'local-staff', isPublished: true, maxAttempts: 10,
    description: 'Synthetic questionnaire for local Garden validation only.',
    questions: [{ id: 'q1', type: 'short_answer', text: 'Enter a synthetic test response', isRequired: true, order: 0 }],
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  if (safety) {
    const {createSafetyControlledGardenRuntime} = backendRequire('./lib/garden-production/safety');
    const {createGardenOperator} = backendRequire('./lib/garden-production/rollout');
    const {assertLocalRewardDatabase} = backendRequire('./lib/garden-rewards/local-safety');
    const operator = createGardenOperator(db, createSafetyControlledGardenRuntime(assertLocalRewardDatabase));
    const expiresAt = Timestamp.fromMillis(Date.now() + 3600000);
    await operator.initialize(expiresAt); await operator.configure(true, expiresAt, 1);
    await operator.enroll('local-garden-init-test', true, expiresAt, 0);
    await operator.enroll('local-garden-existing', true, expiresAt, 0);
  }
  fs.writeFileSync(path.join(runtime, 'private-credentials.json'), JSON.stringify({ projectId: project, controlled, safety, accounts }, null, 2), { mode: 0o600 });
  await db.terminate(); await deleteApp(app);
}
async function stop() {
  if (stopping) return;
  stopping = true;
  fixturesReady = false;
  clearInterval(devicePoll);
  for (const processChild of [...children].reverse()) {
    if (processChild.exitCode === null && processChild.signalCode === null) {
      // Stop only our process subtree on Windows; normal Metro 8082 is never a child.
      cp.spawnSync('taskkill.exe', ['/PID', String(processChild.pid), '/T', '/F'], { windowsHide: true });
    }
  }
  if (healthServer) healthServer.close();
  for (const fd of handles) fs.closeSync(fd);
  console.log('Phase 6C host environment stopped; Android and firewall were not touched.');
}

(async () => {
  const rulesFile = path.join(root, 'docs/sdk53-firestore-restoration/candidate.rules');
  if (crypto.createHash('sha256').update(fs.readFileSync(rulesFile)).digest('hex') !== expectedRules) throw new Error('Candidate rule hash drift');
  const cli = path.join(tools, 'node_modules/firebase-tools/lib/bin/firebase.js');
  if (JSON.parse(fs.readFileSync(path.join(tools, 'node_modules/firebase-tools/package.json'), 'utf8')).version !== '15.34.0') throw new Error('Pinned TEMP Firebase CLI required');
  for (const port of [8083, 15001, 19099, 18089, 19098, 19150, 19440, 19450]) await freePort(port);
  fs.mkdirSync(runtime, { recursive: true });
  // CLI requires rules inside its config project directory. Copy exact bytes into TEMP.
  fs.copyFileSync(rulesFile, path.join(runtime, 'candidate.rules'));
  fs.copyFileSync(path.join(__dirname, 'firebase.json'), path.join(runtime, 'firebase.json'));
  const source = path.join(runtime, 'functions-local');
  fs.mkdirSync(path.join(source, 'lib'), { recursive: true });
  for (const name of ['garden', 'garden-rewards', 'garden-watering', ...(controlled ? ['garden-production'] : [])]) {
    fs.cpSync(path.join(root, 'functions/lib', name), path.join(source, 'lib', name), { recursive: true });
  }
  const entry = safety ? 'local-garden-safety.js' : controlled ? 'local-garden-readiness.js' : 'local-garden.js';
  fs.copyFileSync(path.join(root, 'functions/lib', entry), path.join(source, 'lib', entry));
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ private: true,
    main: `lib/${entry}`, engines: { node: '22' },
    dependencies: JSON.parse(fs.readFileSync(path.join(root, 'functions/package.json'), 'utf8')).dependencies }));
  if (!fs.existsSync(path.join(source, 'node_modules'))) {
    fs.symlinkSync(path.join(root, 'functions/node_modules'), path.join(source, 'node_modules'), 'junction');
  }
  fs.mkdirSync(path.join(runtime, 'cli-profile'), { recursive: true });
  fs.mkdirSync(path.join(tools, 'emulator-cache'), { recursive: true });
  const cachedJar = path.join(os.tmpdir(), 'spartan-g-firestore-restoration-tools/cloud-firestore-emulator-v1.22.0.jar');
  if (fs.existsSync(cachedJar)) {
    const target = path.join(tools, 'emulator-cache', path.basename(cachedJar));
    if (!fs.existsSync(target)) fs.copyFileSync(cachedJar, target, fs.constants.COPYFILE_EXCL);
  }
  const environment = { ...process.env, GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project,
    FIREBASE_CONFIG: JSON.stringify({ projectId: project }), GOOGLE_APPLICATION_CREDENTIALS: '',
    FIREBASE_TOKEN: '', CLOUDSDK_AUTH_ACCESS_TOKEN: '', GOOGLE_OAUTH_ACCESS_TOKEN: '',
    XDG_CONFIG_HOME: path.join(runtime, 'cli-profile'), APPDATA: path.join(runtime, 'cli-profile'),
    FIREBASE_EMULATORS_PATH: path.join(tools, 'emulator-cache'), CI: '1', FIREBASE_CLI_DISABLE_MOTD: 'true',
    JAVA_HOME: 'C:\\Program Files\\Android\\Android Studio\\jbr',
    PATH: `${path.dirname(process.execPath)};C:\\Program Files\\Android\\Android Studio\\jbr\\bin;${process.env.PATH}`,
    JAVA_TOOL_OPTIONS: '-Xmx512m', GCE_METADATA_HOST: '127.0.0.1:1' };
  child(process.execPath, [cli, 'emulators:start', '--project', project, '--config', path.join(runtime, 'firebase.json'),
    '--only', 'auth,firestore,functions', '--non-interactive'], environment, 'firebase-emulators');
  let started = false;
  for (let i = 0; i < 150; i++) {
    if (children[0].exitCode !== null) throw new Error('Emulators exited; inspect TEMP runtime/firebase-emulators.log');
    try {
      const response = await fetch(`http://127.0.0.1:19099/emulator/v1/projects/${project}/config`, { signal: AbortSignal.timeout(500) });
      const firestore = await fetch('http://127.0.0.1:18089/', { signal: AbortSignal.timeout(500) });
      if (response.ok && firestore.status < 500) { started = true; break; }
    } catch {}
    await sleep(500);
  }
  if (!started) throw new Error('Local emulator startup timed out');
  await seed(); fixturesReady = true;
  let functionsReady = false;
  for (let i = 0; i < 20; i++) {
    if (await probe()) { functionsReady = true; break; }
    await sleep(500);
  }
  if (!functionsReady) throw new Error('Auth/Firestore/Functions routing did not become ready.');
  healthServer = http.createServer(async (request, response) => {
    if (request.url === '/stop' && request.method === 'POST') {
      response.writeHead(200); response.end('Stopping local environment'); await stop(); return;
    }
    if (request.url === '/hold' && request.method === 'POST') hold = true;
    else if (request.url === '/resume' && request.method === 'POST') hold = false;
    else if (request.url !== '/health') { response.writeHead(404); response.end(); return; }
    const backendReady = fixturesReady && !hold && await probe();
    const ready = backendReady;
    if (!ready) fs.appendFileSync(path.join(runtime, 'health-events.jsonl'), JSON.stringify({ at: new Date().toISOString(),
      ready, backendReady, hold, hostOnly:true }) + '\n');
    response.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ projectId: project, ready, rulesSha256: expectedRules,
      authPort: 19099, firestorePort: 18089, functionsPort: 15001, region: 'us-central1', hostOnly:true }));
  });
  await new Promise(resolve => healthServer.listen(19098, '127.0.0.1', resolve));
  fs.writeFileSync(path.join(runtime, 'state.json'), JSON.stringify({ projectId: project, parentPid: process.pid,
    hostOnly, authPort: 19099, firestorePort: 18089, functionsPort: 15001, startedAt: new Date().toISOString() }));
  if (hostOnly) {
    console.log('Synthetic host-only Auth/Firestore/Functions environment started; no Android or Metro connection.');
    return;
  }
})().catch(async error => { console.error(error.message); await stop(); process.exitCode = 1; });
process.on('SIGINT', async () => { await stop(); process.exit(); });
process.on('SIGTERM', async () => { await stop(); process.exit(); });
