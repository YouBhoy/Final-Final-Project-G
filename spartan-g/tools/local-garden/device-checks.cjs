// Android-only local test helper. Credentials stay in TEMP and are never logged.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const adb = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/local-garden-emulators');
const runtime = path.join(os.tmpdir(), 'spartan-g-local-garden-runtime');
function run(args, secret = false, binary = false) {
  const result = cp.spawnSync(adb, ['-s', 'emulator-5554', ...args], { windowsHide: true,
    encoding: binary ? undefined : 'utf8', maxBuffer: 16 * 1024 * 1024 });
  fs.appendFileSync(path.join(docs, 'device-commands.jsonl'), JSON.stringify({ at: new Date().toISOString(),
    executable: adb, args: ['-s', 'emulator-5554', ...(secret ? ['shell', 'input', 'text', '[private synthetic fixture]'] : args)], exitCode: result.status }) + '\n');
  if (result.status !== 0) throw new Error(`ADB command failed: ${secret ? 'private fixture input' : args.join(' ')}`);
  return result.stdout;
}
function nodes(preserveInput = false) {
  run(['shell', 'uiautomator', 'dump', '/data/local/tmp/spartan-local-ui.xml']);
  const xml = run(['shell', 'cat', '/data/local/tmp/spartan-local-ui.xml']);
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(match => {
    const values = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], item[2]]));
    if (!preserveInput && values.class === 'android.widget.EditText') values.text = '[field omitted]';
    return values;
  });
}
async function main() {
  const [action, value, second] = process.argv.slice(2);
  if (action === 'inspect') {
    console.log(JSON.stringify(nodes().filter(n => n.text || n['content-desc'] || n.class === 'android.widget.EditText')
      .map(n => ({ text: n.text, description: n['content-desc'], class: n.class, bounds: n.bounds })), null, 2));
  } else if (action === 'screenshot') {
    if (!/^[a-z0-9-]+$/.test(value)) throw new Error('Safe screenshot name required');
    fs.writeFileSync(path.join(docs, `${value}.png`), run(['exec-out', 'screencap', '-p'], false, true));
    console.log(`Saved ${value}.png`);
  } else if (action === 'launch') {
    const health = await fetch('http://127.0.0.1:19098/health').then(r => r.json());
    if (!health.ready || !health.deviceIsolation || health.projectId !== 'demo-spartan-g-local-garden') throw new Error('Local isolation is not ready');
    run(['shell', 'am', 'force-stop', 'com.spartang.mobile']);
    console.log(run(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d',
      'spartan-g://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8083', 'com.spartang.mobile']));
  } else if (action === 'tap') {
    if (![value, second].every(v => /^\d{1,4}$/.test(v))) throw new Error('Numeric coordinates required');
    run(['shell', 'input', 'tap', value, second]);
  } else if (action === 'form-check') {
    if (!['existing', 'missing', 'other'].includes(value)) throw new Error('Known synthetic fixture required');
    const fixture = JSON.parse(fs.readFileSync(path.join(runtime, 'private-credentials.json'), 'utf8')).accounts.find(a => a.fixture === value);
    const fields = nodes(true).filter(n => n.class === 'android.widget.EditText');
    console.log(JSON.stringify({ fieldCount: fields.length, emailMatchesFixture: fields[0]?.text === fixture.email,
      emailCharacters: fields[0]?.text.length, passwordCharacters: fields[1]?.text.length,
      passwordMatchesFixture: fields[1]?.text === fixture.password }));
  } else if (action === 'signin') {
    if (!['existing', 'missing', 'other'].includes(value)) throw new Error('Known synthetic fixture required');
    const health = await fetch('http://127.0.0.1:19098/health').then(r => r.json());
    if (!health.ready || !health.deviceIsolation || health.projectId !== 'demo-spartan-g-local-garden') throw new Error('Local isolation is not ready');
    if (!nodes().some(n => (n.text || '').includes('LOCAL FIREBASE'))) throw new Error('Local Firebase banner required');
    const fields = nodes().filter(n => n.class === 'android.widget.EditText');
    if (fields.length !== 2) throw new Error('Expected two sign-in fields');
    const fixture = JSON.parse(fs.readFileSync(path.join(runtime, 'private-credentials.json'), 'utf8')).accounts.find(a => a.fixture === value);
    for (const [index, text] of [fixture.email, fixture.password].entries()) {
      const currentFields = nodes().filter(n => n.class === 'android.widget.EditText');
      if (currentFields.length !== 2) throw new Error('Sign-in fields unavailable; no further input sent');
      const bounds = currentFields[index].bounds.match(/\d+/g).map(Number);
      run(['shell', 'input', 'tap', String(Math.floor((bounds[0] + bounds[2]) / 2)), String(Math.floor((bounds[1] + bounds[3]) / 2))]);
      run(['shell', 'input', 'text', text], true);
      if (index === 1) {
        await new Promise(resolve => setTimeout(resolve, 700));
        // Dismiss only a confirmed visible keyboard, after input/focus has settled.
        if (/^\s*mInputShown=true\s*$/m.test(run(['shell', 'dumpsys', 'input_method']))) {
          run(['shell', 'input', 'keyevent', '4']);
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }
    }
    const button = nodes().find(n => /sign in|log in/i.test(n.text || n['content-desc'] || '') && n.clickable === 'true');
    if (!button) throw new Error('Sign-in button not found; fields filled privately');
    const bounds = button.bounds.match(/\d+/g).map(Number);
    run(['shell', 'input', 'tap', String(Math.floor((bounds[0] + bounds[2]) / 2)), String(Math.floor((bounds[1] + bounds[3]) / 2))]);
    console.log(`Submitted synthetic ${value} sign-in; credentials omitted.`);
  } else if (action === 'network') {
    const isolation = require('./device-firewall.cjs').status();
    if (!isolation.isolated) throw new Error('Verified app isolation required');
    const sockets = ['tcp', 'tcp6'].flatMap(table => run(['shell', 'su', '0', 'cat', `/proc/net/${table}`])
      .trim().split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/))
      .filter(parts => parts[7] === isolation.uid)
      .map(parts => ({ table, remoteHex: parts[2], stateHex: parts[3] })));
    const counters = run(['shell', 'su', '0', 'iptables', '-w', '5', '-L', 'SG_LGARDEN4', '-v', '-n']);
    const report = { at: new Date().toISOString(), uid: isolation.uid, isolated: true, sockets, counters };
    fs.writeFileSync(path.join(docs, 'android-network.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } else if (action === 'logs') {
    const pid = run(['shell', 'pidof', 'com.spartang.mobile']).trim().split(/\s+/)[0];
    const logs = run(['logcat', '-d', '--pid=' + pid, '-s', 'ReactNativeJS', 'AndroidRuntime']);
    // Local mode only; omit any auth payload rather than logging it.
    const safe = logs.split('\n').filter(line => !/password|accessToken|refreshToken|idToken/i.test(line)).join('\n');
    fs.writeFileSync(path.join(docs, 'android-local.log'), safe);
    console.log(safe.slice(-18000));
  } else throw new Error('Use inspect, screenshot, launch, tap, signin, network or logs');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
