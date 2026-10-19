const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const cp = require('node:child_process');
const ts = require('typescript');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/garden-phase5');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const baselineFile = fs.readdirSync(docs).filter(n => /^active-.*\.rules$/.test(n)).sort().at(-1);
const baseline = fs.readFileSync(path.join(docs, baselineFile), 'utf8');
const candidate = read('docs/sdk53-firestore-restoration/candidate.rules');
const integrity = JSON.parse(read('docs/sdk53-firestore-restoration/candidate-integrity.json'));
const additionLength = candidate.length - baseline.length;
const recovered = candidate.slice(0, integrity.insertionOffset) + candidate.slice(integrity.insertionOffset + additionLength);
if (recovered !== baseline) throw new Error('Candidate changes existing deployed text');
const diff = cp.spawnSync('git', ['diff', '--no-index', '--', path.join(docs, baselineFile), path.join(root, 'docs/sdk53-firestore-restoration/candidate.rules')], { encoding: 'utf8', windowsHide: true });
if (diff.status !== 1) throw new Error('Expected insertion-only diff');
fs.writeFileSync(path.join(docs, 'candidate-vs-active.diff'), diff.stdout);
const names = ['firebase-admin', 'firebase-functions', 'expo-server-sdk', 'typescript', '@types/node'];
const pkg = JSON.parse(read('functions/package.json'));
const lock = JSON.parse(read('functions/package-lock.json'));
const versions = names.map(name => ({ name, declared: pkg.dependencies?.[name] || pkg.devDependencies?.[name], installed: JSON.parse(read(`functions/node_modules/${name}/package.json`)).version, locked: lock.packages[`node_modules/${name}`]?.version }));
const envFile = dotenv.parse(read('apps/mobile/.env'));
const moduleObject = { exports: {} };
const compiled = ts.transpileModule(read('packages/shared-services/src/config/env.native.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { exports: moduleObject.exports, module: moduleObject, process: { env: envFile }, require: name => {
  if (name === './local-emulators') return { localEmulators: { enabled: false } };
  if (name === './env.shared') return { resolveDeploymentTarget() { throw new Error('Not part of configuration evaluation'); } };
  throw new Error('Unexpected normal configuration import');
} });
const normal = moduleObject.exports.env.firebase;
const google = JSON.parse(read('apps/mobile/google-services.json')).project_info;
const notificationSource = read('functions/src/index.ts');
const report = { checkedAt: new Date().toISOString(), node: process.version, configuredRuntime: pkg.engines.node, packageMain: pkg.main, versions,
  cliVersion: JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'spartan-g-local-firebase-tools-15.34.0/node_modules/firebase-tools/package.json'), 'utf8')).version,
  candidateSha256: sha(candidate), activeSha256: sha(baseline), insertionOnly: recovered === baseline, addedLines: candidate.split('\n').length - baseline.split('\n').length,
  privateCollectionsHaveNoGrant: ['garden_reward_control', 'garden_reward_submissions', 'garden_reward_receipts'].every(name => !candidate.includes(`match /${name}/`)),
  normalConfig: { projectId: normal.projectId, authDomain: normal.authDomain, googleServicesProjectId: google.project_id, emulatorFlagInDotEnv: Object.hasOwn(envFile, 'EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE'), expectedProject: normal.projectId === 'spartan-g-a2d80' && google.project_id === 'spartan-g-a2d80' },
  notificationExports: [...notificationSource.matchAll(/^export const (\w+)/gm)].map(m => m[1]),
  notificationEntrySha256: sha(notificationSource), productionIndexImportsGarden: /from ['"].*garden/.test(notificationSource),
  modeEnvironmentPresent: ['EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FUNCTIONS_EMULATOR'].filter(name => !!process.env[name]) };
fs.writeFileSync(path.join(docs, 'static-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
