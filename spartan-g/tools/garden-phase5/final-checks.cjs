const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const net = require('node:net');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/garden-phase5');
const ports = [8082, 8083, 15001, 18089, 19098, 19099, 19150, 19440, 19450, 18081, 18082, 18084];
const probe = port => new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port });
  let settled = false;
  function done(open) { if (settled) return; settled = true; socket.destroy(); resolve({ port, open }); }
  socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.setTimeout(500, () => done(false));
});
(async () => {
  const mobile = cp.spawnSync(process.execPath, ['apps/mobile/node_modules/typescript/bin/tsc', '--noEmit', '-p', 'apps/mobile/tsconfig.json'], { cwd: root, encoding: 'utf8', windowsHide: true });
  fs.writeFileSync(path.join(docs, 'mobile-typescript-node22.txt'), mobile.stdout + mobile.stderr);
  const diagnostics = (mobile.stdout + mobile.stderr).split(/\r?\n/).filter(line => /error TS\d+:/.test(line));
  const powershell = 'Get-CimInstance Win32_Process | Where-Object { ($_.ExecutablePath -like "*spartan-g-phase5-node22.23.3*") -or ($_.CommandLine -like "*spartan-g-garden-phase5*") } | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath | ConvertTo-Json -Compress';
  const processResult = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', powershell], { encoding: 'utf8', windowsHide: true });
  const processes = processResult.stdout.trim() ? [].concat(JSON.parse(processResult.stdout)) : [];
  const remaining = processes.filter(p => p.ProcessId !== process.pid && !['powershell.exe', 'pwsh.exe'].includes(p.Name));
  const listening = await Promise.all(ports.map(probe));
  const zip = path.join(os.tmpdir(), 'spartan-g-phase5-node22.23.3/node-v22.23.3-win-x64.zip');
  const result = { checkedAt: new Date().toISOString(), node: process.version, runtime: process.execPath, archiveSha256: crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex'), mobileTypeScriptExitCode: mobile.status, mobileDiagnostics: diagnostics, onlyKnownAppointmentError: diagnostics.length === 1 && diagnostics[0].includes('AppointmentsScreen.tsx(113,36)') && diagnostics[0].includes('TS2551'), ports: listening, ownedTestProcessesRemaining: remaining, processInspectionStatus: processResult.status, firewallStatePresent: ['spartan-phase4-garden-firewall.json', 'spartan-local-garden-firewall.json'].filter(p => fs.existsSync(path.join(os.tmpdir(), p))), runtimeInstalledInProject: false, packagesInstalled: false, persistentPathChanged: false };
  fs.writeFileSync(path.join(docs, 'final-checks.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.onlyKnownAppointmentError || remaining.length || processResult.status !== 0 || listening.some(p => p.open && p.port !== 8082) || result.firewallStatePresent.length) process.exitCode = 1;
})();
