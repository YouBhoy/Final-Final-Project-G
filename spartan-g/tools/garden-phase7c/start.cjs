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
const project = 'demo-spartan-g-garden-phase2';
const expectedRules = '4ec0f3c9bb399b9489c1d6ebf18f176ec81b9de3fbd20c3dee4fc5f370b7a5b1';
const tools = path.join(os.tmpdir(), 'spartan-g-local-firebase-tools-15.34.0');
const runtime = path.join(os.tmpdir(), 'spartan-g-garden-phase7c-device');
const docs = path.join(root, 'docs/garden-phase7c');
const backendRequire = createRequire(path.join(root, 'functions/package.json'));
const firewall = require('./device-firewall.cjs');
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
  const { getFirestore, FieldValue } = backendRequire('firebase-admin/firestore');
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
  await db.doc('courses/local-course').create({ title: 'Synthetic Garden course', isPublished: true, isActive: true });
  await db.doc('assessments/local-lesson').create({ title: 'Local Garden check-in',
    courseId: 'local-course', facilitatorId: 'local-staff', isPublished: true, maxAttempts: 10,
    description: 'Synthetic questionnaire for local Garden validation only.',
    questions: [{ id: 'q1', type: 'short_answer', text: 'Enter a synthetic test response', isRequired: true, order: 0 }],
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  fs.writeFileSync(path.join(runtime, 'private-credentials.json'), JSON.stringify({ projectId: project, accounts }, null, 2), { mode: 0o600 });
  await db.terminate(); await deleteApp(app);
}
async function stop() {
  if (stopping) return;
  stopping = true;
  fixturesReady = false;
  clearInterval(devicePoll);
  if (!hostOnly) cp.spawnSync(path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe'),
    ['-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'com.spartang.mobile'], { windowsHide: true });
  for (const processChild of [...children].reverse()) {
    if (processChild.exitCode === null && processChild.signalCode === null) {
      // Stop only our process subtree on Windows; normal Metro 8082 is never a child.
      cp.spawnSync('taskkill.exe', ['/PID', String(processChild.pid), '/T', '/F'], { windowsHide: true });
    }
  }
  if (healthServer) healthServer.close();
  for (const fd of handles) fs.closeSync(fd);
  console.log('Local environment stopped. App is stopped; the per-app firewall remains until explicitly disabled.');
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
  fs.copyFileSync(path.join(__dirname, 'device-firebase.json'), path.join(runtime, 'firebase.json'));
  const source = path.join(runtime, 'functions-local');
  fs.mkdirSync(path.join(source, 'lib'), { recursive: true });
  for (const name of ['garden', 'garden-rewards', 'garden-watering']) {
    fs.cpSync(path.join(root, 'functions/lib', name), path.join(source, 'lib', name), { recursive: true });
  }
  fs.copyFileSync(path.join(root, 'functions/lib/local-garden.js'), path.join(source, 'lib/local-garden.js'));
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ private: true,
    main: 'lib/local-garden.js', engines: { node: '22' },
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
  let deviceIsolation = false;
  let deviceCheckAt = 0;
  let deviceCheckRunning = false;
  const refreshDevice = () => {
    if (deviceCheckRunning) return;
    deviceCheckRunning = true;
    cp.execFile(process.execPath, [path.join(__dirname, 'device-firewall.cjs'), 'status'],
      { windowsHide: true, timeout: 10000 }, (error, stdout) => {
        try { deviceIsolation = !error && JSON.parse(stdout).isolated === true; }
        catch { deviceIsolation = false; }
        deviceCheckAt = Date.now(); deviceCheckRunning = false;
      });
  };
  if (!hostOnly) { refreshDevice(); devicePoll = setInterval(refreshDevice, 4000); }
  healthServer = http.createServer(async (request, response) => {
    if (request.url === '/stop' && request.method === 'POST') {
      response.writeHead(200); response.end('Stopping local environment'); await stop(); return;
    }
    if (request.url === '/hold' && request.method === 'POST') hold = true;
    else if (request.url === '/resume' && request.method === 'POST') hold = false;
    else if (request.url !== '/health') { response.writeHead(404); response.end(); return; }
    const backendReady = fixturesReady && !hold && await probe();
    const ready = backendReady && deviceIsolation && Date.now() - deviceCheckAt < 15000;
    if (!ready) fs.appendFileSync(path.join(runtime, 'health-events.jsonl'), JSON.stringify({ at: new Date().toISOString(),
      ready, backendReady, hold, deviceIsolation, deviceCheckAgeMs: Date.now() - deviceCheckAt }) + '\n');
    response.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ projectId: project, ready, rulesSha256: expectedRules,
      authPort: 19099, firestorePort: 18089, functionsPort: 15001, region: 'us-central1', deviceIsolation }));
  });
  await new Promise(resolve => healthServer.listen(19098, '127.0.0.1', resolve));
  fs.writeFileSync(path.join(runtime, 'state.json'), JSON.stringify({ projectId: project, parentPid: process.pid,
    hostOnly, authPort: 19099, firestorePort: 18089, functionsPort: 15001, startedAt: new Date().toISOString() }));
  if (hostOnly) {
    console.log('Synthetic host-only Auth/Firestore/Functions environment started; no Android or Metro connection.');
    return;
  }
  const metroEnvironment = { ...environment, EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE: '1',
    EXPO_PUBLIC_APP_ENV: 'development', EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1',
    REACT_NATIVE_PACKAGER_HOSTNAME: '10.0.2.2' };
  delete metroEnvironment.CI; // Watch new local-only files; CLI itself remains noninteractive.
  const mobileRequire = createRequire(path.join(root, 'apps/mobile/package.json'));
  child(process.execPath, [mobileRequire.resolve('expo/bin/cli'), 'start', '--dev-client', '--localhost', '--port', '8083', '--clear'],
    metroEnvironment, 'metro-local', path.join(root, 'apps/mobile'));
  fs.writeFileSync(path.join(runtime, 'state.json'), JSON.stringify({ projectId: project, parentPid: process.pid,
    authPort: 19099, firestorePort: 18089, functionsPort: 15001, region: 'us-central1',
    metroPort: 8083, rulesSha256: expectedRules, startedAt: new Date().toISOString() }, null, 2));
  fs.writeFileSync(path.join(docs, 'environment.json'), JSON.stringify({ projectId: project, authPort: 19099,
    firestorePort: 18089, functionsPort: 15001, region: 'us-central1', healthPort: 19098,
    metroPort: 8083, rulesSha256: expectedRules, syntheticFixtures: 4 }, null, 2) + '\n');
  // Warm the Android bundle before the native dev client's shorter HTTP timeout.
  let manifest;
  for (let i = 0; i < 90; i++) {
    try {
      const response = await fetch('http://127.0.0.1:8083/', {
        headers: { 'expo-platform': 'android' }, signal: AbortSignal.timeout(2000),
      });
      if (response.ok) { manifest = await response.json(); break; }
    } catch {}
    await sleep(500);
  }
  const bundle = new URL(manifest?.launchAsset?.url);
  if (bundle.protocol !== 'http:' || bundle.hostname !== '10.0.2.2' || bundle.port !== '8083') {
    throw new Error('Android bundle must resolve to the isolated Metro host');
  }
  fs.writeFileSync(path.join(docs, 'metro-android-url.json'), JSON.stringify({ launchAssetUrl: bundle.href,
    hostUri: manifest.extra?.expoClient?.hostUri }, null, 2) + '\n');
  bundle.hostname = '127.0.0.1';
  console.log('Warming isolated Android bundle; wait for the ready message before launching.');
  const warm = await fetch(bundle, { signal: AbortSignal.timeout(180000) });
  if (!warm.ok) throw new Error('Local Android bundle compilation failed; inspect metro-local.log');
  await warm.arrayBuffer();
  console.log(`Synthetic Auth/Firestore seeded for ${project}. Local Metro: 8083. Health requires verified device isolation.`);
  console.log('Credentials are private TEMP fixtures and are not printed. Keep this process running. Ctrl+C stops only this environment.');
})().catch(async error => { console.error(error.message); await stop(); process.exitCode = 1; });
process.on('SIGINT', async () => { await stop(); process.exit(); });
process.on('SIGTERM', async () => { await stop(); process.exit(); });
