const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'stop.cjs'), 'utf8');
const owned = { Name: 'node.exe', CommandLine: 'node tools/local-garden/start.cjs' };
function scenario({ processResults = [], killStatus = 0, appStopFails = false, keep = false } = {}) {
  const calls = []; let disabled = 0;
  const module = { exports: {} };
  const mocks = {
    'node:fs': { existsSync: () => true, readFileSync: () => JSON.stringify({ projectId: 'demo-spartan-g-local-garden', parentPid: 12345 }) },
    'node:child_process': {
      execFileSync(command, args) { calls.push({ command, args }); if (appStopFails) throw new Error('Synthetic app stop failure'); },
      spawnSync(command, args) {
        calls.push({ command, args });
        return command === 'taskkill.exe' ? { status: killStatus, stdout: '' }
          : { status: 0, stdout: processResults.length ? JSON.stringify(processResults.shift()) : '' };
      },
    },
    './device-firewall.cjs': { stateFile: 'synthetic-firewall-state', disable() { disabled++; } },
  };
  const context = vm.createContext({ module, exports: module.exports,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    process: { env: { LOCALAPPDATA: 'C:/Synthetic' }, argv: keep ? ['node', 'stop.cjs', '--keep-firewall'] : ['node', 'stop.cjs'] },
    fetch: async () => ({}), AbortSignal, console: { log() {}, warn() {} },
  });
  vm.runInContext(source, context, { filename: 'stop.cjs' });
  return { stop: module.exports.stopEnvironment, calls, disabled: () => disabled };
}
test('an already stopped owned launcher still removes the firewall after stopping the app', async () => {
  const s = scenario(); await s.stop();
  assert.deepEqual(Array.from(s.calls[0].args).slice(-3), ['am', 'force-stop', 'com.spartang.mobile']);
  assert.equal(s.disabled(), 1); assert.equal(s.calls.some(c => c.command === 'taskkill.exe'), false);
});
test('a child-exit taskkill race cannot strand the firewall when the launcher is gone', async () => {
  const s = scenario({ processResults: [owned], killStatus: 1 }); await s.stop();
  assert.equal(s.disabled(), 1);
  assert.deepEqual(Array.from(s.calls.find(c => c.command === 'taskkill.exe').args), ['/PID', '12345', '/T', '/F']);
});
test('PID reuse is rejected without killing an unrelated process; stopped-app firewall cleanup still runs', async () => {
  const s = scenario({ processResults: [{ Name: 'node.exe', CommandLine: 'node unrelated-service.js' }] });
  await assert.rejects(s.stop(), /PID was reused/);
  assert.equal(s.calls.some(c => c.command === 'taskkill.exe'), false); assert.equal(s.disabled(), 1);
});
test('a launcher that fails to stop is reported but does not prevent stopped-app firewall cleanup', async () => {
  const s = scenario({ processResults: [owned, owned], killStatus: 1 });
  await assert.rejects(s.stop(), /did not stop/); assert.equal(s.disabled(), 1);
});
test('failure to stop the app never removes its isolation firewall', async () => {
  const s = scenario({ appStopFails: true });
  await assert.rejects(s.stop(), /app stop failure/); assert.equal(s.disabled(), 0);
});
test('explicit controlled-restart mode retains the approved firewall', async () => {
  const s = scenario({ keep: true }); await s.stop(); assert.equal(s.disabled(), 0);
});
