const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),net=require('node:net'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7b'),before=JSON.parse(fs.readFileSync(path.join(docs,'preservation-before.json'),'utf8'));
const main='apps/mobile/android/app/src/main/java/com/spartang/mobile/MainApplication.kt';
const added=new Set([...['GardenHttpClient','GardenHttpSettings','GardenHttpModule','GardenHttpPackage'].map(n=>`apps/mobile/android/app/src/main/java/com/spartang/mobile/garden/${n}.kt`),
 ...['externalGardenClient','nativeGardenTransport','externalGardenBackend'].map(n=>`apps/mobile/src/garden/${n}.ts`)]);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const probe=port=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});let done=false;
 const finish=open=>{if(done)return;done=true;s.destroy();resolve({port,open});};s.on('connect',()=>finish(true));s.on('error',()=>finish(false));s.setTimeout(500,()=>finish(false));});
(async()=>{
 const changed=before.entries.filter(e=>!fs.existsSync(path.join(root,e.path))||hash(path.join(root,e.path))!==e.sha256).map(e=>e.path);
 const files=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','.'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 const oldPaths=new Set(before.entries.map(e=>e.path));
 const unexpectedAdditions=files.filter(p=>!oldPaths.has(p)&&!added.has(p)&&!p.startsWith('docs/garden-phase7b/')&&!p.startsWith('tools/garden-phase7b/'));
 const missingAdditions=[...added].filter(p=>!files.includes(p));
 const backups=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Linked backup');if(e.isDirectory())walk(p);else backups.push({path:path.relative(root,p),sha256:hash(p)});}}
 for(const name of ['spartan-g-backup-before-sdk54','spartan-g-backup-after-copilot','spartan-g-backup-phase4-20261015'])walk(path.resolve(root,'..',name));
 const backupMap=new Map(backups.map(e=>[e.path,e.sha256])),oldBackups=new Set(before.backups.map(e=>e.path));
 const backupChanges=before.backups.filter(e=>backupMap.get(e.path)!==e.sha256).map(e=>e.path),backupAdditions=backups.filter(e=>!oldBackups.has(e.path));
 const savedMain=path.join(root,before.backupDir,main),sourceBackupPreserved=hash(savedMain)===before.entries.find(e=>e.path===main).sha256;
 const normalize=text=>text.replace(/\r\n/g,'\n');
 const expected=normalize(fs.readFileSync(savedMain,'utf8')).replace('import expo.modules.ReactNativeHostWrapper','import expo.modules.ReactNativeHostWrapper\nimport com.spartang.mobile.garden.GardenHttpPackage')
  .replace('val packages = PackageList(this).packages','val packages = PackageList(this).packages\n            packages.add(GardenHttpPackage())');
 const mainDeltaApproved=normalize(fs.readFileSync(path.join(root,main),'utf8'))===expected;
 const tracked=text=>text.split(/\r?\n/).filter(l=>l.length>=4&&!l.startsWith('??')&&l.slice(3)!==main).sort();
 const status=cp.execFileSync('git',['status','--short','--','.'],{cwd:root,encoding:'utf8'});
 const gitStatusPreserved=JSON.stringify(tracked(status))===JSON.stringify(tracked(fs.readFileSync(path.join(docs,'git-status-before.txt'),'utf8')))
  &&status.split(/\r?\n/).includes(` M ${main}`);
 const native=fs.readFileSync(path.join(root,'apps/mobile/android/app/src/main/java/com/spartang/mobile/garden/GardenHttpSettings.kt'),'utf8');
 const factory=fs.readFileSync(path.join(root,'apps/mobile/src/garden/externalGardenBackend.ts'),'utf8');
 const routingDisabled=/const val ENABLED = false/.test(native)&&/APPROVED_ORIGIN: String\? = null/.test(native)&&/EXTERNAL_GARDEN_ROUTING_ENABLED = false/.test(factory);
 const appRefs=files.filter(p=>p.startsWith('apps/mobile/src/')&&!added.has(p)&&/\.(ts|tsx)$/.test(p)&&/externalGardenBackend|externalGardenClient|nativeGardenTransport/.test(fs.readFileSync(path.join(root,p),'utf8')));
 const dependencyFiles=['package.json','package-lock.json','functions/package.json','functions/package-lock.json','apps/mobile/package.json'].map(p=>({path:p,
  unchanged:hash(path.join(root,p))===before.entries.find(e=>e.path===p)?.sha256}));
 const remainingTestProcesses=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command',
  `$items = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'java.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match 'phase7b|garden-phase6c|cloud-firestore-emulator-v1\\.22\\.0' } | Select-Object Name,ProcessId); ConvertTo-Json -InputObject $items -Compress`],{encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,'').trim());
 const remainingScratch=fs.readdirSync(os.tmpdir()).filter(n=>/^spartan-g-(?:garden-phase7b-\d{8}T\d{6}Z|phase7b-native-)/.test(n));
 const ports=await Promise.all([18081,18082,18084,18085,18086,18088,18089,18090,19097,19099,15001,19098,19150,19151,19440,19441,19450,19451].map(probe));
 const links=[];for(const name of ['REPORT.md','BRIDGE_CONTRACT.md','TEST_RESULTS.md','PRECHANGE_PLAN.md']){
  for(const match of fs.readFileSync(path.join(docs,name),'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
   const target=match[1];if(/^(https?:|#)/.test(target))continue;
   links.push({file:name,target,exists:['FILES.json','final-verification.json'].includes(target)||fs.existsSync(path.resolve(docs,target.replace(/#.*$/,'')))});
  }
 }
 const at=new Date().toISOString(),stamp=at.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const result={at,node:process.version,preExistingFiles:before.entries.length,unchangedFiles:before.entries.length-changed.length,changed,
  newSourceFiles:[...added],unexpectedChanges:changed.filter(p=>p!==main),unexpectedAdditions,missingAdditions,backupFiles:backups.length,backupChanges,backupAdditions,
  sourceBackupPreserved,mainDeltaApproved,gitStatusPreserved,dependencyFiles,routingDisabled,existingApplicationReferences:appRefs,
  remainingTestProcesses,remainingScratch,ports,links,productionAccess:false,androidRuntimeTested:false,apkBuilt:false,
  passed:changed.length===1&&changed[0]===main&&!unexpectedAdditions.length&&!missingAdditions.length&&!backupChanges.length&&!backupAdditions.length
   &&backups.length===before.backups.length&&sourceBackupPreserved&&mainDeltaApproved&&gitStatusPreserved&&dependencyFiles.every(f=>f.unchanged)
   &&routingDisabled&&!appRefs.length&&!remainingTestProcesses.length&&!remainingScratch.length&&ports.every(p=>!p.open)&&links.every(l=>l.exists)};
 const artifact=`preservation-after-${stamp}.json`;fs.writeFileSync(path.join(docs,artifact),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 const manifest=files.filter(p=>p===main||added.has(p)||p.startsWith('docs/garden-phase7b/')||p.startsWith('tools/garden-phase7b/'))
  .filter(p=>!p.endsWith('/FILES.json')&&!p.endsWith('/final-verification.json')).map(p=>({path:p,sha256:hash(path.join(root,p))}));
 manifest.push({path:`docs/garden-phase7b/${artifact}`,sha256:hash(path.join(docs,artifact))});
 fs.writeFileSync(path.join(docs,'FILES.json'),JSON.stringify({at,files:manifest},null,2)+'\n');
 fs.writeFileSync(path.join(docs,'final-verification.json'),JSON.stringify({...result,artifact,manifest:'FILES.json'},null,2)+'\n');
 for(const link of links)if(!fs.existsSync(path.resolve(docs,link.target.replace(/#.*$/,''))))throw Error(`Missing link: ${link.target}`);
 console.log(JSON.stringify({passed:result.passed,preExistingFiles:result.preExistingFiles,unchangedFiles:result.unchangedFiles,changed,unexpectedAdditions,
  backupFiles:backups.length,backupChanges,sourceBackupPreserved,mainDeltaApproved,gitStatusPreserved,routingDisabled,
  openPorts:ports.filter(p=>p.open),remainingTestProcesses,remainingScratch,brokenLinks:links.filter(l=>!l.exists)},null,2));
 if(!result.passed)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
