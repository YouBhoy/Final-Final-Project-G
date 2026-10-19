const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7b');fs.mkdirSync(docs,{recursive:true});
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const affected=['apps/mobile/android/app/src/main/java/com/spartang/mobile/MainApplication.kt'];
const inventory=()=>cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','.'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)
 .filter(p=>!p.startsWith('docs/garden-phase7b/')&&!p.startsWith('tools/garden-phase7b/'));
function backups(){const files=[];function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isSymbolicLink())throw Error('Linked checkpoint');if(e.isDirectory())walk(p);else files.push({path:path.relative(root,p),sha256:hash(p)});}}
 for(const name of ['spartan-g-backup-before-sdk54','spartan-g-backup-after-copilot','spartan-g-backup-phase4-20261015'])walk(path.resolve(root,'..',name));return files;}
const beforeFile=path.join(docs,'preservation-before.json');
if(process.argv.includes('--before')){
 if(fs.existsSync(beforeFile))throw Error('Do not replace initial checkpoint');
 const at=new Date().toISOString(),stamp=at.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const entries=inventory().map(p=>({path:p,sha256:hash(path.join(root,p))}));
 for(const p of ['apps/mobile/.env','apps/mobile/.env.local'])if(fs.existsSync(path.join(root,p))&&!entries.some(e=>e.path===p))entries.push({path:p,sha256:hash(path.join(root,p))});
 const backupDir=`docs/garden-phase7b/backup-${stamp}`;
 for(const p of affected){const target=path.join(root,backupDir,p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,p),target,fs.constants.COPYFILE_EXCL);}
 fs.writeFileSync(path.join(docs,'git-status-before.txt'),cp.execFileSync('git',['status','--short','--','.'],{cwd:root}));
 fs.writeFileSync(path.join(docs,'git-before.patch'),cp.execFileSync('git',['diff','--binary','--','.'],{cwd:root,maxBuffer:20*1024*1024}));
 const result={at,entries,backups:backups(),affected,backupDir};fs.writeFileSync(beforeFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({preExistingFiles:entries.length,backupFiles:result.backups.length,backupDir,affected},null,2));
}else{throw Error('Use --before only before implementation');}
