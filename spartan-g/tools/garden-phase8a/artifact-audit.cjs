// Offline JS/source-map export only. No native build, app execution or Firebase access.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), mobile = path.join(root, 'apps/mobile'), docs = path.join(root, 'docs/garden-phase8a');
const mode = process.argv[2];
if (!['release-0', 'release-1', 'development-normal', 'development-local'].includes(mode)) throw new Error('Explicit audit mode required');
const dev = mode.startsWith('development'), local = mode === 'development-local';
const flag = mode === 'release-1' || local ? '1' : '0';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const output = path.join(mobile, `.expo/garden-phase8a-${mode}-${stamp}`);
const cli = require.resolve('expo/bin/cli', { paths: [mobile] });
const args = [cli, 'export', '--platform', 'android', '--no-bytecode', '--source-maps', '--max-workers', '2', '--output-dir', output];
if (dev) args.push('--dev');
const env = { ...process.env, NODE_ENV: dev ? 'development' : 'production', EXPO_PUBLIC_APP_ENV: dev ? 'development' : 'production',
  EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE: flag, EXPO_PUBLIC_SPARTAN_GARDEN_BACKEND: dev ? '0' : '1', EXPO_OFFLINE: '1', CI: '1' };
const log = path.join(docs, `artifact-${mode}-${stamp}.log`), fd = fs.openSync(log, 'wx');
const result = cp.spawnSync(process.execPath, args, { cwd: mobile, env, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 480000 });
fs.closeSync(fd);
const files = [];
function walk(dir) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) e.isDirectory() ? walk(path.join(dir,e.name)) : files.push(path.join(dir,e.name)); }
walk(output);
const bundles = files.filter(f => /\.js$/.test(f));
const maps = files.filter(f => /\.map$/.test(f));
const sources = [...new Set(maps.flatMap(f => JSON.parse(fs.readFileSync(f,'utf8')).sources || []))].map(s => s.replace(/\\/g,'/'));
const forbiddenSources = sources.filter(s => /apps\/mobile\/src\/development\//.test(s)
  || /(?:local-emulator-contract|local-emulators\.native|env\.native|local-garden-operations)\.ts$/.test(s)
  || /(?:GardenBackendBoundary|GardenRewardStatus|garden-backend)\.local\.tsx?$/.test(s));
const markers = ['10.0.2.2', 'demo-spartan-g-garden-phase2', 'synthetic-local-emulator-only', 'LOCAL_FIREBASE_BLOCKED_NONLOCAL_REQUEST', 'local-garden-existing'];
const artifacts = bundles.map(f => { const content = fs.readFileSync(f,'utf8'); return { path: path.relative(output,f), bytes: Buffer.byteLength(content), sha256: crypto.createHash('sha256').update(content).digest('hex'), forbiddenMarkers: markers.filter(m=>content.includes(m)) }; });
const normalConfigPresent = sources.some(s => s.endsWith('/config/env.normal.native.ts'));
const releaseClean = result.status === 0 && bundles.length > 0 && maps.length > 0 && !forbiddenSources.length && artifacts.every(a => !a.forbiddenMarkers.length) && normalConfigPresent;
const localPreserved = result.status === 0 && forbiddenSources.some(s => s.includes('LocalFirebaseBoundary')) && artifacts.some(a => a.forbiddenMarkers.includes('10.0.2.2'));
const report = { checkedAt: new Date().toISOString(), node: process.version, mode, dev, localOptIn: flag, preparedProductionRouting: !dev,
  output, status: result.status, signal: result.signal, log: path.basename(log), artifacts, sourceCount: sources.length, forbiddenSources,
  normalConfigPresent, passed: local ? localPreserved : releaseClean, nativeBuild: false, appExecuted: false, productionAccess: false };
fs.writeFileSync(path.join(docs, `artifact-${mode}-${stamp}.json`), JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({ mode, status: result.status, passed: report.passed, artifacts: artifacts.map(a=>({bytes:a.bytes, forbiddenMarkers:a.forbiddenMarkers})), forbiddenSources },null,2));
if (!report.passed) process.exitCode = 1;
