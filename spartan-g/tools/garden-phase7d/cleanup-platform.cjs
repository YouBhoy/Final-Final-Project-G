// Remove only this run's stopped synthetic legacy launcher scratch, never project dependencies.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7d'),tmp=fs.realpathSync(os.tmpdir()),target=path.resolve(tmp,'spartan-g-garden-phase6c');
const before=JSON.parse(fs.readFileSync(path.join(docs,'preservation-before.json'),'utf8')),state=JSON.parse(fs.readFileSync(path.join(target,'state.json'),'utf8'));
if(fs.realpathSync(target).toLowerCase()!==target.toLowerCase()||path.dirname(target).toLowerCase()!==tmp.toLowerCase()||state.projectId!=='demo-spartan-g-garden-phase2'||state.hostOnly!==true||Date.parse(state.startedAt)<Date.parse(before.at))throw Error('Scratch ownership/date/path mismatch');
const active=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command',`$items = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'java.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match 'garden-phase6c|garden-phase7d|cloud-firestore-emulator-v1\\.22\\.0' } | Select-Object Name,ProcessId); ConvertTo-Json -InputObject $items -Compress`],{encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,'').trim());if(active.length)throw Error('Test process still active');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');if(hash(path.join(target,'candidate.rules'))!=='4ec0f3c9bb399b9489c1d6ebf18f176ec81b9de3fbd20c3dee4fc5f370b7a5b1')throw Error('Scratch rules mismatch');
const junction=path.join(target,'functions-local/node_modules');if(!fs.lstatSync(junction).isSymbolicLink()||fs.realpathSync(junction).toLowerCase()!==fs.realpathSync(path.join(root,'functions/node_modules')).toLowerCase())throw Error('Unexpected dependency link');
if(fs.statSync(target).birthtimeMs<Date.parse(before.at)){
 // The legacy launcher intentionally reuses a pre-existing TEMP workspace.
 // Preserve its cached output and dependency junction; delete only this run's
 // identifiable synthetic credential file. Do not recursively delete older work.
 const file=path.join(target,'private-credentials.json'),s=fs.lstatSync(file),v=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!s.isFile()||s.isSymbolicLink()||s.mtimeMs<Date.parse(before.at)||v.projectId!==state.projectId||!Array.isArray(v.accounts)||v.accounts.length!==4||v.accounts.some(a=>!/^local-garden-/.test(a.uid)||!/@garden\.example\.invalid$/.test(a.email)))throw Error('Unexpected synthetic credentials');
 const record={path:'private-credentials.json',bytes:s.size,sha256:hash(file)};fs.unlinkSync(file);
 const result={at:new Date().toISOString(),target,preExistingScratchPreserved:true,dependencyJunctionPreserved:true,currentSyntheticCredentialsRemoved:!fs.existsSync(file),allTestServicesStopped:true,removedCurrentFiles:[record]};
 fs.writeFileSync(path.join(docs,'platform-cleanup.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exit();
}
fs.rmdirSync(junction);
const files=[];function inspect(p){const s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('Unexpected remaining scratch link');if(s.isDirectory())for(const n of fs.readdirSync(p))inspect(path.join(p,n));else if(s.isFile())files.push({path:path.relative(target,p),bytes:s.size,sha256:hash(p)});else throw Error('Unexpected scratch content');}inspect(target);
fs.rmSync(target,{recursive:true,force:false});const result={at:new Date().toISOString(),target,removed:!fs.existsSync(target),syntheticCredentialsRemoved:true,projectDependencyJunctionRemovedWithoutFollowing:true,files};fs.writeFileSync(path.join(docs,'platform-cleanup.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({removed:result.removed,syntheticCredentialsRemoved:true}));
