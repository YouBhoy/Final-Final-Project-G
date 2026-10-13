// Read-only local inventory. Emits indicators and locations, never secret values.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 10_000_000 }).split('\0').filter(Boolean);
const excluded = /(^|\/)(node_modules|dist|lib|\.git)\//;
const source = tracked.filter(p => !excluded.test(p) && /\.(ts|tsx|js|mjs|json|rules|bat)$/.test(p));
const indicators = [];
for (const path of source) {
  if (!existsSync(resolve(root,path))) continue;
  const lines = readFileSync(resolve(root,path),'utf8').split(/\r?\n/);
  lines.forEach((line,index) => {
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)) indicators.push({ path, line: index+1, kind: 'private-key marker; value redacted' });
    if (/(?:AIza[\w-]{35}|GOCSPX-[\w-]{20,}|gh[pousr]_[\w]{30,}|sk-(?:proj-)?[\w-]{32,})/.test(line)) indicators.push({ path, line: index+1, kind: 'credential-like string; value redacted; validity unknown' });
  });
}
const localKeys = ['spartan-g/spartan-g-a2d80-firebase-adminsdk-fbsvc-e1921052d2.json','spartan-g/scripts/service-account.json'].filter(p => existsSync(resolve(root,p))).map(path => {
  try {
    const data = JSON.parse(readFileSync(resolve(root,path),'utf8'));
    return { path, tracked: tracked.includes(path), serviceAccountType: data.type === 'service_account', containsPrivateKey: typeof data.private_key === 'string' && data.private_key.includes('PRIVATE KEY') };
  } catch { return { path, tracked: tracked.includes(path), parseable: false }; }
});
const lockfiles = ['package-lock.json','spartan-g/package-lock.json','spartan-g/firebase/functions/package-lock.json'];
const locks = lockfiles.map(path => {
  const lock = JSON.parse(readFileSync(resolve(root,path),'utf8'));
  return { path, lockfileVersion: lock.lockfileVersion, packageCount: Object.keys(lock.packages ?? {}).length,
    versions: Object.fromEntries(Object.entries(lock.packages ?? {}).filter(([p]) => /node_modules\/(firebase|firebase-admin|firebase-functions|react|react-native|expo|vite|typescript|react-router-dom)$/.test(p)).map(([p,d]) => [p,d.version])) };
});
const historical = ['root','workspaces','functions'].map(scope => {
  const path = `spartan-g/docs/security/security-audit-${scope}-2026-10-12.json`;
  const data = JSON.parse(readFileSync(resolve(root,path),'utf8').replace(/^\uFEFF/,''));
  return { scope, source: path, freshness: 'Historical repository evidence; fresh registry request failed on 2026-10-13',
    counts: data.metadata?.vulnerabilities, advisories: Object.values(data.vulnerabilities ?? {}).flatMap(v => v.via.filter(a => typeof a === 'object').map(a => ({ dependency: v.name, name: a.name, title: a.title, severity: a.severity, range: a.range, url: a.url, cwe: a.cwe }))) };
});
const evidence = { date: '2026-10-13 Asia/Manila', baseline: execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  trackedFileCount: tracked.length, trackedDependencyFileCount: tracked.filter(p => /(^|\/)node_modules\//.test(p)).length,
  scannedFirstPartySourceCount: source.length, limitations: ['Heuristic scan, not proof of absence of secrets','Git history and credential validity not checked','Firebase public client API keys are not privileged Admin credentials'],
  indicators, localKeys, locks, historical,
  hostingHeaders: JSON.parse(readFileSync(resolve(root,'spartan-g/firebase.json'),'utf8')).hosting.headers };
mkdirSync(resolve(root,'security_audit/evidence'),{ recursive:true });
writeFileSync(resolve(root,'security_audit/evidence/local-assessment.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({ scannedFirstPartySourceCount: source.length, secretIndicators: indicators.length, localKeyFiles: localKeys.length,
  historicalCounts: historical.map(h => ({scope:h.scope,counts:h.counts})), trackedDependencyFileCount: evidence.trackedDependencyFileCount }));
