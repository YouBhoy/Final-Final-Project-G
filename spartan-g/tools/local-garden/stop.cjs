const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const firewall = require('./device-firewall.cjs');
const adb = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
async function stopEnvironment() {
  cp.execFileSync(adb, ['-s', 'emulator-5554', 'shell', 'am', 'force-stop', 'com.spartang.mobile'], { windowsHide: true });
  let cleanupIssue;
  try {
  try {
    await fetch('http://127.0.0.1:19098/stop', { method: 'POST', signal: AbortSignal.timeout(3000) });
  } catch {}
  const state = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'spartan-g-local-garden-runtime/state.json'), 'utf8'));
  if (state.projectId !== 'demo-spartan-g-local-garden' || !Number.isSafeInteger(state.parentPid)) throw new Error('Unknown runtime ownership');
  const result = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter 'ProcessId = ${state.parentPid}' | Select-Object Name,CommandLine | ConvertTo-Json -Compress`],
    { encoding: 'utf8', windowsHide: true });
  if (result.stdout.trim()) {
    const processInfo = JSON.parse(result.stdout);
    if (processInfo.Name !== 'node.exe' || !/tools[\\/]local-garden[\\/]start\.cjs/.test(processInfo.CommandLine)) {
      throw new Error('PID was reused; refusing to stop an unrelated process');
    }
    const killed = cp.spawnSync('taskkill.exe', ['/PID', String(state.parentPid), '/T', '/F'], { encoding: 'utf8', windowsHide: true });
    if (killed.status !== 0) {
      const stillRunning = cp.spawnSync('powershell.exe', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter 'ProcessId = ${state.parentPid}' | Select-Object Name,CommandLine | ConvertTo-Json -Compress`],
        { encoding: 'utf8', windowsHide: true });
      if (stillRunning.stdout.trim()) throw new Error('Owned launcher did not stop; inspect local process ownership');
      console.warn('Launcher exited during cleanup; taskkill reported already-exiting child processes.');
    }
  }
  } catch (error) { cleanupIssue = error; }
  finally {
    // App is already stopped. A process-exit race must never prevent firewall rollback.
    if (!process.argv.includes('--keep-firewall') && fs.existsSync(firewall.stateFile)) firewall.disable();
  }
  if (cleanupIssue) throw cleanupIssue;
  console.log(process.argv.includes('--keep-firewall') ? 'Owned environment stopped; approved firewall retained for restart.'
    : 'Owned environment stopped. Owned firewall removed; inspect firewall-rollback.json for full-table comparison. Normal Metro 8082 was not stopped.');
}
module.exports = { stopEnvironment };
if (require.main === module) stopEnvironment().catch(error => { console.error(error.message); process.exitCode = 1; });
