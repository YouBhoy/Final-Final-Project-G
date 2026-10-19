// Android inspection only. No routing/firewall mutation, app launch, stop or login.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/garden-phase5');
const adb = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const commands = [];
function run(args) {
  const r = cp.spawnSync(adb, args, { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  commands.push({ args, status: r.status, stderr: r.stderr || '' });
  return r.stdout || '';
}
const devices = run(['devices', '-l']);
const connected = /^emulator-5554\s+device\b/m.test(devices);
const normalize = text => text.split(/\r?\n/).filter(s => s && !s.startsWith('#')).map(s => s.replace(/\[\d+:\d+\]/g, '[COUNTERS]')).join('\n');
const filter = text => { const start = text.indexOf('*filter'); return start < 0 ? null : text.slice(start, text.indexOf('COMMIT', start) + 6); };
const result = { checkedAt: new Date().toISOString(), connected, firewallMarkersPresent: ['spartan-phase4-garden-firewall.json', 'spartan-local-garden-firewall.json'].filter(p => fs.existsSync(path.join(os.tmpdir(), p))) };
if (connected) {
  const shell = args => run(['-s', 'emulator-5554', 'shell', ...args]);
  result.bootComplete = shell(['getprop', 'sys.boot_completed']).trim();
  result.pages = shell(['getconf', 'PAGESIZE']).trim();
  result.appPid = shell(['pidof', 'com.spartang.mobile']).trim();
  const ipv4 = normalize(shell(['su', '0', 'iptables-save']));
  const ipv6 = normalize(shell(['su', '0', 'ip6tables-save']));
  const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/garden-mobile-phase4/firewall-baseline-state.json'), 'utf8')).baseline;
  result.ownedChainsAbsent = !/SG_LGARDEN[46]/.test(ipv4 + ipv6);
  result.filter4MatchesPhase4Baseline = !!filter(ipv4) && filter(ipv4) === filter(baseline.ipv4);
  result.filter6MatchesPhase4Baseline = !!filter(ipv6) && filter(ipv6) === filter(baseline.ipv6);
  result.full4MatchesPhase4Baseline = ipv4 === baseline.ipv4;
  result.full6MatchesPhase4Baseline = ipv6 === baseline.ipv6;
  fs.writeFileSync(path.join(docs, 'device-network-current.json'), JSON.stringify({ ipv4, ipv6 }, null, 2) + '\n');
  result.route4 = shell(['ip', 'route', 'show']).trim();
  result.route6 = shell(['ip', '-6', 'route', 'show']).trim();
  result.connectivitySummary = shell(['dumpsys', 'connectivity']).split(/\r?\n/).filter(s => /Active default network|NetworkAgentInfo.*CONNECTED|VALIDATED|LinkProperties:/.test(s)).slice(0, 12);
}
result.commands = commands;
fs.writeFileSync(path.join(docs, 'device-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
