// Reversible, per-application emulator firewall. Never changes APK/native project files.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const adb = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const serial = 'emulator-5554';
const packageName = 'com.spartang.mobile';
const stateFile = path.join(os.tmpdir(), 'spartan-phase7c-garden-firewall.json');
const tables = [['iptables', 'SG_LGARDEN4'], ['ip6tables', 'SG_LGARDEN6']];
const docs = path.resolve(__dirname, '../../docs/garden-phase7c');

function command(args, allowFailure = false) {
  const result = cp.spawnSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true });
  fs.appendFileSync(path.join(docs, 'firewall-commands.jsonl'), JSON.stringify({ at: new Date().toISOString(),
    executable: adb, args: ['-s', serial, ...args], exitCode: result.status,
    stdoutSha256: crypto.createHash('sha256').update(result.stdout || '').digest('hex'),
    stderr: result.stderr || '' }) + '\n');
  if (!allowFailure && result.status !== 0) throw new Error(`Emulator firewall command failed: ${result.stderr.trim()}`);
  return result;
}
const root = (table, args, allowFailure) => command(['shell', 'su', '0', table,
  ...(['iptables', 'ip6tables'].includes(table) ? ['-w', '5'] : []), ...args], allowFailure);
function normalize(configuration) {
  return configuration.split(/\r?\n/).filter(line => line && !line.startsWith('#'))
    .map(line => line.replace(/\[\d+:\d+\]/g, '[COUNTERS]')).join('\n');
}
function filterTable(configuration) {
  const lines = configuration.split('\n');
  const start = lines.indexOf('*filter');
  const end = lines.indexOf('COMMIT', start);
  if (start < 0 || end < start) throw new Error('Missing filter-table evidence');
  return lines.slice(start, end + 1).join('\n');
}
function changedLines(before, after) {
  const oldLines = new Set(before.split('\n'));
  const newLines = new Set(after.split('\n'));
  return { removed: [...oldLines].filter(line => !newLines.has(line)), added: [...newLines].filter(line => !oldLines.has(line)) };
}
function topology() {
  return { ipv4: normalize(root('iptables-save', []).stdout), ipv6: normalize(root('ip6tables-save', []).stdout) };
}
function preflight() {
  if (command(['get-serialno']).stdout.trim() !== serial) throw new Error('Unexpected Android target');
  const qemu = command(['shell', 'getprop', 'ro.boot.qemu']).stdout.trim();
  if (qemu !== '1') throw new Error('A disposable Android emulator is required');
  const uid = appUid();
  const owners = command(['shell', 'cmd', 'package', 'list', 'packages', '--uid', uid, '-U']).stdout.trim().split(/\r?\n/);
  if (owners.length !== 1 || owners[0] !== `package:${packageName} uid:${uid}`) throw new Error('Shared/ambiguous UID; no firewall change made');
  for (const [table, chain] of tables) {
    if (root(table, ['-S', chain], true).status === 0) throw new Error('Owned chain name is already in use');
    const help = root(table, ['--help']).stdout;
    if (!help.includes('--delete') || !help.includes('--delete-chain')) throw new Error('Required rollback operations are unavailable');
  }
  const baseline = topology();
  const report = { serial, packageName, uid, uniqueUid: true, systemUidsUnaffected: true,
    ipv4Sha256: crypto.createHash('sha256').update(baseline.ipv4).digest('hex'),
    ipv6Sha256: crypto.createHash('sha256').update(baseline.ipv6).digest('hex'),
    ports: { metro: 8083, functions: 15001, firestore: 18089, readiness: 19098, auth: 19099 },
    rollback: 'Stop app; delete exact UID jumps; remove only owned chains; compare normalized before/after rules' };
  fs.writeFileSync(path.join(docs, 'firewall-preflight.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(docs, 'network-before-ipv4.rules'), baseline.ipv4 + '\n');
  fs.writeFileSync(path.join(docs, 'network-before-ipv6.rules'), baseline.ipv6 + '\n');
  return { report, baseline };
}
function appUid() {
  const output = command(['shell', 'cmd', 'package', 'list', 'packages', '-U', packageName]).stdout;
  const match = output.match(/^package:com\.spartang\.mobile uid:(\d+)\s*$/m);
  const uid = Number(match?.[1]);
  if (!Number.isSafeInteger(uid) || uid < 10000) throw new Error('Exact application UID not found; no firewall change made');
  return String(uid);
}
function ownedState() {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (state.serial !== serial || state.packageName !== packageName || state.uid !== appUid()) throw new Error('Firewall ownership mismatch');
  return state;
}
function status() {
  try {
    const state = ownedState();
    const rules = tables.map(([table, chain]) => ({ table, chain,
      jump: root(table, ['-C', 'OUTPUT', '-m', 'owner', '--uid-owner', state.uid, '-j', chain], true).status === 0,
      rules: root(table, ['-S', chain], true).stdout.trim().split(/\r?\n/),
    }));
    const v4 = rules[0].rules;
    const expectedV4 = [
      '-N SG_LGARDEN4',
      '-A SG_LGARDEN4 -d 10.0.2.2/32 -p tcp -m multiport --dports 8083,15001,18089,19098,19099 -j ACCEPT',
      '-A SG_LGARDEN4 -j REJECT --reject-with icmp-port-unreachable',
    ];
    const expectedV6 = ['-N SG_LGARDEN6', '-A SG_LGARDEN6 -j REJECT --reject-with icmp6-port-unreachable'];
    return { isolated: rules.every(rule => rule.jump) && JSON.stringify(v4) === JSON.stringify(expectedV4)
      && JSON.stringify(rules[1].rules) === JSON.stringify(expectedV6), uid: state.uid, rules };
  } catch { return { isolated: false }; }
}
function enable() {
  command(['shell', 'am', 'force-stop', packageName]);
  if (fs.existsSync(stateFile)) {
    if (!status().isolated) throw new Error('Existing firewall state needs manual inspection; refusing to overwrite');
    return;
  }
  const { report, baseline } = preflight();
  const uid = report.uid;
  fs.writeFileSync(stateFile, JSON.stringify({ serial, packageName, uid, baseline }) + '\n', { flag: 'wx' });
  try {
    for (const [table, chain] of tables) {
      root(table, ['-N', chain]);
      if (table === 'iptables') root(table, ['-A', chain, '-d', '10.0.2.2', '-p', 'tcp', '-m', 'multiport', '--dports', '8083,15001,18089,19098,19099', '-j', 'ACCEPT']);
      root(table, ['-A', chain, '-j', 'REJECT', '--reject-with', table === 'iptables' ? 'icmp-port-unreachable' : 'icmp6-port-unreachable']);
      root(table, ['-I', 'OUTPUT', '1', '-m', 'owner', '--uid-owner', uid, '-j', chain]);
    }
    if (!status().isolated) throw new Error('Firewall verification failed');
  } catch (error) {
    try { disable(); } catch (rollbackError) { throw new AggregateError([error, rollbackError], 'Firewall setup and rollback need inspection; app remains stopped'); }
    throw error;
  }
}
function disable() {
  command(['shell', 'am', 'force-stop', packageName]);
  const state = ownedState();
  for (const [table, chain] of tables) {
    if (root(table, ['-C', 'OUTPUT', '-m', 'owner', '--uid-owner', state.uid, '-j', chain], true).status === 0) {
      root(table, ['-D', 'OUTPUT', '-m', 'owner', '--uid-owner', state.uid, '-j', chain]);
    }
    if (root(table, ['-S', chain], true).status === 0) { root(table, ['-F', chain]); root(table, ['-X', chain]); }
  }
  const restored = topology();
  const result = { checkedAt: new Date().toISOString(), ipv4Restored: restored.ipv4 === state.baseline.ipv4,
    ipv6Restored: restored.ipv6 === state.baseline.ipv6, appStopped: true,
    ipv4FilterRestored: filterTable(restored.ipv4) === filterTable(state.baseline.ipv4),
    ipv6FilterRestored: filterTable(restored.ipv6) === filterTable(state.baseline.ipv6),
    ipv4Difference: changedLines(state.baseline.ipv4, restored.ipv4),
    ipv6Difference: changedLines(state.baseline.ipv6, restored.ipv6) };
  fs.writeFileSync(path.join(docs, 'network-after-ipv4.rules'), restored.ipv4 + '\n');
  fs.writeFileSync(path.join(docs, 'network-after-ipv6.rules'), restored.ipv6 + '\n');
  fs.writeFileSync(path.join(docs, 'firewall-rollback.json'), JSON.stringify(result, null, 2) + '\n');
  if (!result.ipv4FilterRestored || !result.ipv6FilterRestored) {
    throw new Error('Owned chains removed, but filter tables differ; inspect evidence without overwriting system rules');
  }
  if (!result.ipv4Restored || !result.ipv6Restored) {
    console.warn('Owned IPv4/IPv6 filter tables restored exactly. Other Android-managed tables changed; see firewall-rollback.json. No system rules were overwritten.');
  }
  const archive = path.join(docs, 'firewall-baseline-state.json');
  if (!fs.existsSync(archive)) fs.copyFileSync(stateFile, archive, fs.constants.COPYFILE_EXCL);
  fs.unlinkSync(stateFile);
  return result;
}
module.exports = { status, enable, disable, preflight, stateFile };
if (require.main === module) {
  try {
    const action = process.argv[2];
    if (action === 'preflight') { console.log(JSON.stringify(preflight().report, null, 2)); process.exit(); }
    if (action === 'enable') enable();
    else if (action === 'disable') disable();
    else if (action !== 'status') throw new Error('Use enable, status or disable');
    console.log(JSON.stringify(status(), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
