// Build a local Android production JS artifact only. No native build or app launch.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/garden-phase5');
const mobile = path.join(root, 'apps/mobile');
// SDK 53 requires output beneath the mobile project. This is ignored build output.
const output = path.join(mobile, '.expo/garden-phase5-release-export');
if (fs.existsSync(output)) throw new Error('Use a fresh TEMP export directory; no existing artifact will be removed.');
const cli = require.resolve('expo/bin/cli', { paths: [mobile] });
const args = [cli, 'export', '--platform', 'android', '--no-bytecode', '--max-workers', '2', '--output-dir', output];
const environment = { ...process.env, NODE_ENV: 'production', EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE: '0', EXPO_OFFLINE: '1', CI: '1' };
const fd = fs.openSync(path.join(docs, 'release-export-project.log'), 'wx');
const result = cp.spawnSync(process.execPath, args, { cwd: mobile, env: environment, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 480000 });
fs.closeSync(fd);
const found = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.js$/.test(entry.name)) {
      const text = fs.readFileSync(file, 'utf8');
      const needles = ['10.0.2.2', '127.0.0.1:18089', '127.0.0.1:19099', 'demo-spartan-g-garden-phase2', '19098', '19099', '18089', 'spartan-g-a2d80'];
      found.push({ file: path.relative(output, file), bytes: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(text).digest('hex'), presentStrings: needles.filter(n => text.includes(n)), androidHostEndpointLiterals: [...new Set(text.match(/(?:https?|wss?):\/\/10\.0\.2\.2:\d+/g) || [])] });
    }
  }
}
walk(output);
const report = { checkedAt: new Date().toISOString(), node: process.version, command: [process.execPath, ...args], output, status: result.status, signal: result.signal, errorCode: result.error?.code, releaseMode: true, emulatorOptIn: '0', offlineExport: true, nativeBuild: false, cloudDeployment: false, artifacts: found };
fs.writeFileSync(path.join(docs, 'release-artifact-audit-project.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
if (result.status !== 0) process.exitCode = 1;
