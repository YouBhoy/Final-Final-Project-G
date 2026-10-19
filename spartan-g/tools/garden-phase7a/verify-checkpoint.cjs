// Final approved backend-only preservation check; no Android/cloud operations.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto'), net = require('node:net');
const root = path.resolve(__dirname, '../..'), docs = path.join(root, 'docs/garden-phase7a');
const baseline = JSON.parse(fs.readFileSync(path.join(docs, 'preservation-before.json'), 'utf8'));
const allowedChange='functions/src/garden-rewards/processor.ts';
const additions=new Set(['functions/src/garden-rewards/definition.ts','functions/src/external-garden.ts',
  ...['auth','client','errors','finalizer','server','service'].map(name=>`functions/src/external-garden/${name}.ts`),
  'functions/tests/external-garden.test.cjs','functions/tests/fixtures/external-server.cjs','functions/tsconfig.external-garden.json']);
const hash = p => {
  const digest = crypto.createHash('sha256'), fd = fs.openSync(p, 'r'), buffer = Buffer.alloc(1048576);
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) digest.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); } return digest.digest('hex');
};
const probe = port => new Promise(resolve => {
  let done = false; const socket = net.connect({ host: '127.0.0.1', port });
  const finish = open => { if (done) return; done = true; socket.destroy(); resolve({ port, open }); };
  socket.on('connect', () => finish(true)); socket.on('error', () => finish(false)); socket.setTimeout(500, () => finish(false));
});
(async () => {
  const changed = baseline.entries.filter(e => !fs.existsSync(path.join(root, e.path)) || hash(path.join(root, e.path)) !== e.sha256).map(e => e.path);
  const backupFiles = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isSymbolicLink()) throw new Error('Checkpoint symlink requires review');
      if (e.isDirectory()) walk(file); else if (e.isFile()) backupFiles.push({ path: path.relative(root, file), sha256: hash(file) });
    }
  }
  for (const name of ['spartan-g-backup-before-sdk54', 'spartan-g-backup-after-copilot', 'spartan-g-backup-phase4-20261015']) walk(path.resolve(root, '..', name));
  const backupMap = new Map(backupFiles.map(e => [e.path, e.sha256]));
  const backupChanges = baseline.backups.filter(e => backupMap.get(e.path) !== e.sha256).map(e => e.path);
  const oldBackups = new Set(baseline.backups.map(e => e.path));
  const addedBackupFiles = backupFiles.filter(e => !oldBackups.has(e.path)).map(e => e.path);
  const savedSourceChanges = baseline.affected.filter(p => hash(path.join(root, baseline.backupDir, p)) !== baseline.entries.find(e => e.path === p).sha256);
  const files = cp.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const oldPaths = new Set(baseline.entries.map(e => e.path));
  const newSourceFiles=files.filter(p=>additions.has(p));
  const unexpectedAdditions = files.filter(p => !oldPaths.has(p) && !additions.has(p) && !p.startsWith('docs/garden-phase7a/') && !p.startsWith('tools/garden-phase7a/'));
  const unexpectedChanges=changed.filter(p=>p!==allowedChange);
  const missingAdditions=[...additions].filter(p=>!files.includes(p));
  const status=cp.execFileSync('git',['status','--short','--','.'],{cwd:root,encoding:'utf8'});
  const tracked=text=>text.split(/\r?\n/).filter(l=>l.length>=4&&!l.startsWith('??')&&!l.slice(3).startsWith('../')).sort();
  const beforeTracked=tracked(fs.readFileSync(path.join(docs,'git-status-before.txt'),'utf8')),afterTracked=tracked(status);
  const trackedGitStatusPreserved=JSON.stringify(beforeTracked)===JSON.stringify(afterTracked);
  const dependencyFiles=['package.json','package-lock.json','functions/package.json','functions/package-lock.json','apps/mobile/package.json']
    .filter(p=>baseline.entries.some(e=>e.path===p)).map(p=>({path:p,unchanged:hash(path.join(root,p))===baseline.entries.find(e=>e.path===p).sha256}));
  const scratchDirectories=require('node:os').tmpdir();
  const remainingPhase7Scratch=fs.readdirSync(scratchDirectories).filter(n=>/^spartan-g-garden-phase7a-\d{8}T\d{6}Z$/.test(n));
  const ports = await Promise.all([18081, 18082, 18084, 18085, 18086, 18088, 18089, 18090, 19097, 19099, 15001, 19098, 19150, 19151, 19440, 19441, 19450, 19451].map(probe));
  const links = [];
  for (const name of ['REPORT.md', 'API_CONTRACT.md', 'HOSTING_READINESS.md', 'TEST_RESULTS.md', 'MOBILE_REDIRECT_BLOCKER.md', 'PRECHANGE_PLAN.md']) {
    for (const m of fs.readFileSync(path.join(docs, name), 'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(https?:|#)/.test(m[1])) continue;
      // These two outputs are written below and checked on disk before sign-off.
      links.push({ file: name, target: m[1], exists: ['FILES.json','final-verification.json'].includes(m[1])
        || fs.existsSync(path.resolve(docs, m[1].replace(/#.*$/, ''))) });
    }
  }
  const candidates=files.filter(p=>p.startsWith('apps/mobile/')||p.startsWith('packages/'));
  const externalImports=candidates.filter(p=>/\.(?:ts|tsx|js|cjs|json)$/.test(p)&&/external-garden/.test(fs.readFileSync(path.join(root,p),'utf8')));
  const candidateSha256=hash(path.join(root,'docs/sdk53-firestore-restoration/candidate.rules'));
  const remainingTestProcesses=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command',
    `$items = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'java.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match 'garden-phase7a|garden-phase6c|cloud-firestore-emulator-v1\\.22\\.0' } | Select-Object Name,ProcessId); ConvertTo-Json -InputObject $items -Compress`],
    {cwd:root,encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,'').trim());
  const at=new Date().toISOString(),stamp=at.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const result = { at, node: process.version, preExistingFiles: baseline.entries.length,unchangedFiles:baseline.entries.length-changed.length,
    changed, unexpectedChanges,newSourceFiles,missingAdditions,unexpectedAdditions, backupFilesBefore: baseline.backups.length, backupFilesNow: backupFiles.length,
    backupChanges, addedBackupFiles, savedSourceChanges, ports, links,externalMobileImports:externalImports,candidateSha256,
    remainingTestProcesses,remainingPhase7Scratch,trackedGitStatusPreserved,dependencyFiles,
    trackedGitStatusBefore:beforeTracked,trackedGitStatusAfter:afterTracked,
    androidAccess:false,productionAccess: false,androidExternalIntegration:false,
    passed: changed.length===1&&changed[0]===allowedChange&&!unexpectedChanges.length&&!unexpectedAdditions.length&&!missingAdditions.length
      &&!backupChanges.length&&!addedBackupFiles.length&&!savedSourceChanges.length&&!externalImports.length
      &&candidateSha256==='4ec0f3c9bb399b9489c1d6ebf18f176ec81b9de3fbd20c3dee4fc5f370b7a5b1'
      &&!remainingTestProcesses.length&&!remainingPhase7Scratch.length&&trackedGitStatusPreserved
      &&dependencyFiles.every(p=>p.unchanged)&&ports.every(p => !p.open)&&links.every(l => l.exists) };
  const artifact=`preservation-after-${stamp}.json`;
  fs.writeFileSync(path.join(docs,artifact),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  const manifest=files.filter(p=>p===allowedChange||additions.has(p)||p.startsWith('docs/garden-phase7a/')||p.startsWith('tools/garden-phase7a/'))
    .filter(p=>!p.endsWith('/FILES.json')&&!p.endsWith('/final-verification.json')).map(p=>({path:p,sha256:hash(path.join(root,p))}));
  manifest.push({path:`docs/garden-phase7a/${artifact}`,sha256:hash(path.join(docs,artifact))});
  fs.writeFileSync(path.join(docs,'FILES.json'),JSON.stringify({at,files:manifest},null,2)+'\n');
  fs.writeFileSync(path.join(docs,'final-verification.json'),JSON.stringify({...result,artifact,manifest:'FILES.json'},null,2)+'\n');
  for(const link of links)if(!fs.existsSync(path.resolve(docs,link.target.replace(/#.*$/,''))))throw Error(`Missing output/link: ${link.target}`);
  console.log(JSON.stringify({passed:result.passed,preExistingFiles:result.preExistingFiles,unchangedFiles:result.unchangedFiles,
    changed,backupFiles:backupFiles.length,backupChanges,unexpectedChanges,unexpectedAdditions,missingAdditions,
    openPorts:ports.filter(p=>p.open),remainingTestProcesses,remainingPhase7Scratch,trackedGitStatusPreserved,
    dependencyFiles,brokenLinks:links.filter(l=>!l.exists),externalImports,artifact},null,2));
  if (!result.passed) process.exitCode = 1;
})().catch(e => { console.error(e.message); process.exitCode = 1; });
