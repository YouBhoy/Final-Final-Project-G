// Phase 7D pre-test checkpoint; only new documentation/backups are written.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7d');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:30*1024*1024});
const inventory=()=>git(['ls-files','--cached','--others','--exclude-standard','-z','--','.']).toString('utf8').split('\0').filter(Boolean).filter(p=>!p.startsWith('docs/garden-phase7d/')&&!p.startsWith('tools/garden-phase7d/'));
function backups(){const entries=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isSymbolicLink())throw Error('Linked checkpoint');if(e.isDirectory())walk(p);else entries.push({path:path.relative(root,p),sha256:hash(p)});}}
 for(const n of ['spartan-g-backup-before-sdk54','spartan-g-backup-after-copilot','spartan-g-backup-phase4-20261015'])walk(path.resolve(root,'..',n));return entries;}
const beforeFile=path.join(docs,'preservation-before.json');
if(process.argv.includes('--before')){
 if(fs.existsSync(beforeFile))throw Error('Do not replace initial checkpoint');fs.mkdirSync(docs,{recursive:true});
 const at=new Date().toISOString(),stamp=at.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const original=JSON.parse(fs.readFileSync(path.join(root,'docs/garden-phase7c/preservation-before.json'),'utf8')).backups;
 const current=backups(),old=new Map(original.map(e=>[e.path,e.sha256]));
 if(original.length!==1824||current.length!==1824||current.some(e=>old.get(e.path)!==e.sha256))throw Error('Existing 1824-file backup inventory changed; no new baseline accepted');
 const entries=inventory().map(p=>({path:p,sha256:hash(path.join(root,p))}));
 for(const p of ['apps/mobile/.env','apps/mobile/.env.local'])if(fs.existsSync(path.join(root,p))&&!entries.some(e=>e.path===p))entries.push({path:p,sha256:hash(path.join(root,p))});
 const nativeBackupDir=`docs/garden-phase7d/backup-${stamp}`;
 const possibleChanges=['apps/mobile/android/app/src/main/java/com/spartang/mobile/garden/GardenHttpClient.kt','apps/mobile/android/app/src/main/java/com/spartang/mobile/garden/GardenHttpModule.kt'];
 for(const p of possibleChanges){const target=path.join(root,nativeBackupDir,p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,p),target,fs.constants.COPYFILE_EXCL);if(hash(target)!==hash(path.join(root,p)))throw Error('Source backup mismatch');}
 const apkBackupDir=path.join(os.tmpdir(),`spartan-g-phase7d-pretest-${stamp}`);fs.mkdirSync(apkBackupDir,{recursive:false});
 const outputs=[];for(const name of ['app-debug.apk','output-metadata.json']){const p=path.join(root,'apps/mobile/android/app/build/outputs/apk/debug',name);if(fs.existsSync(p)){const target=path.join(apkBackupDir,name);fs.copyFileSync(p,target,fs.constants.COPYFILE_EXCL);if(hash(target)!==hash(p))throw Error('APK backup mismatch');outputs.push({path:path.relative(root,p),backup:target,sha256:hash(p),bytes:fs.statSync(p).size});}}
 fs.writeFileSync(path.join(docs,'git-status-before.txt'),git(['status','--short']));fs.writeFileSync(path.join(docs,'git-before.patch'),git(['diff','--binary']));
 const result={at,branch:git(['branch','--show-current']).toString().trim(),head:git(['rev-parse','HEAD']).toString().trim(),entries,backups:current,backupMatchesPriorPhase:true,possibleChanges,nativeBackupDir,apkBackupDir,outputs};
 fs.writeFileSync(beforeFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({at,projectFiles:entries.length,backupFiles:current.length,backupMatchesPriorPhase:true,nativeBackupDir,apkBackupDir,outputs},null,2));
}else if(process.argv.includes('--verify')){
 const before=JSON.parse(fs.readFileSync(beforeFile,'utf8')),changes=before.entries.filter(e=>!fs.existsSync(path.join(root,e.path))||hash(path.join(root,e.path))!==e.sha256),old=new Set(before.entries.map(e=>e.path)),added=inventory().filter(p=>!old.has(p));
 const current=backups(),backupChanges=before.backups.filter(e=>!fs.existsSync(path.join(root,e.path))||hash(path.join(root,e.path))!==e.sha256);
 const patchMatches=git(['diff','--binary']).equals(fs.readFileSync(path.join(docs,'git-before.patch'))),outputBackupsIntact=before.outputs.every(e=>hash(e.backup)===e.sha256),sourceBackupsIntact=before.possibleChanges.every(p=>hash(path.join(root,before.nativeBackupDir,p))===before.entries.find(e=>e.path===p).sha256);
 const result={at:new Date().toISOString(),preExistingFiles:before.entries.length,changes,added,backupFiles:current.length,backupChanges,patchMatches,outputBackupsIntact,sourceBackupsIntact};result.passed=changes.length===0&&added.length===0&&current.length===1824&&backupChanges.length===0&&patchMatches&&outputBackupsIntact&&sourceBackupsIntact;
 fs.writeFileSync(path.join(docs,'preservation-current.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
}else throw Error('Use --before or --verify');
