// Phase 7C preservation. No application source changes are authorized by this tool.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7c');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const git=args=>cp.execFileSync('git',args,{cwd:root,maxBuffer:30*1024*1024});
const inventory=()=>git(['ls-files','--cached','--others','--exclude-standard','-z','--','.']).toString('utf8').split('\0').filter(Boolean).filter(p=>!p.startsWith('docs/garden-phase7c/')&&!p.startsWith('tools/garden-phase7c/'));
function backups(){const files=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isSymbolicLink())throw Error('Linked checkpoint');if(e.isDirectory())walk(p);else files.push({path:path.relative(root,p),sha256:hash(p)});}}
 for(const name of ['spartan-g-backup-before-sdk54','spartan-g-backup-after-copilot','spartan-g-backup-phase4-20261015'])walk(path.resolve(root,'..',name));return files;}
const beforeFile=path.join(docs,'preservation-before.json');
if(process.argv.includes('--before')){
 if(fs.existsSync(beforeFile))throw Error('Initial checkpoint already exists');fs.mkdirSync(docs,{recursive:true});
 const at=new Date().toISOString(),stamp=at.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const entries=inventory().map(p=>({path:p,sha256:hash(path.join(root,p))}));
 for(const p of ['apps/mobile/.env','apps/mobile/.env.local'])if(fs.existsSync(path.join(root,p))&&!entries.some(e=>e.path===p))entries.push({path:p,sha256:hash(path.join(root,p))});
 const backupDir=path.join(os.tmpdir(),`spartan-g-phase7c-prebuild-${stamp}`);fs.mkdirSync(backupDir,{recursive:false});
 const outputs=[];for(const name of ['app-debug.apk','output-metadata.json']){const p=path.join(root,'apps/mobile/android/app/build/outputs/apk/debug',name);if(fs.existsSync(p)){const target=path.join(backupDir,name);fs.copyFileSync(p,target,fs.constants.COPYFILE_EXCL);if(hash(p)!==hash(target))throw Error('Prebuild backup mismatch');outputs.push({path:path.relative(root,p),backup:target,sha256:hash(p),size:fs.statSync(p).size});}}
 fs.writeFileSync(path.join(docs,'git-status-before.txt'),git(['status','--short']));fs.writeFileSync(path.join(docs,'git-before.patch'),git(['diff','--binary']));
 const result={at,branch:git(['branch','--show-current']).toString().trim(),head:git(['rev-parse','HEAD']).toString().trim(),entries,backups:backups(),backupDir,outputs};
 fs.writeFileSync(beforeFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({at,files:entries.length,backupFiles:result.backups.length,outputs,backupDir},null,2));
}else if(process.argv.includes('--verify')){
 const before=JSON.parse(fs.readFileSync(beforeFile,'utf8')),changes=before.entries.filter(e=>!fs.existsSync(path.join(root,e.path))||hash(path.join(root,e.path))!==e.sha256);
 const old=new Set(before.entries.map(e=>e.path)),added=inventory().filter(p=>!old.has(p));const afterBackups=backups(),backupChanges=before.backups.filter(e=>!fs.existsSync(path.join(root,e.path))||hash(path.join(root,e.path))!==e.sha256);
 const backupsMatch=afterBackups.length===before.backups.length&&backupChanges.length===0;
 const patchMatches=git(['diff','--binary']).equals(fs.readFileSync(path.join(docs,'git-before.patch')));
 const outputBackupsIntact=before.outputs.every(e=>fs.existsSync(e.backup)&&hash(e.backup)===e.sha256);
 const sourceUnchanged=changes.length===0&&added.length===0;
 const result={at:new Date().toISOString(),preExistingFiles:before.entries.length,changes,added,backupFiles:afterBackups.length,backupChanges,backupsMatch,patchMatches,outputBackupsIntact,sourceUnchanged,passed:sourceUnchanged&&backupsMatch&&patchMatches&&outputBackupsIntact};
 fs.writeFileSync(path.join(docs,'final-preservation.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(docs,'git-status-after.txt'),git(['status','--short']));console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
}else throw Error('Use --before or --verify');
