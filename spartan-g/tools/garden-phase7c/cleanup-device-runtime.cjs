// Remove only this phase's stopped, synthetic TEMP environment. Keep every APK/source backup.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7c'),temporary=fs.realpathSync(os.tmpdir());
const target=path.resolve(temporary,'spartan-g-garden-phase7c-device'),actual=fs.realpathSync(target);
if(path.dirname(actual).toLowerCase()!==temporary.toLowerCase()||actual.toLowerCase()!==target.toLowerCase())throw Error('Unsafe resolved TEMP target');
const state=JSON.parse(fs.readFileSync(path.join(target,'state.json'),'utf8'));
if(state.projectId!=='demo-spartan-g-garden-phase2'||state.metroPort!==8083)throw Error('Unexpected scratch ownership');
const active=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command',`$items = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'java.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} -and ($_.ProcessId -eq ${state.parentPid} -or $_.CommandLine -match 'garden-phase7c|cloud-firestore-emulator-v1\\.22\\.0') } | Select-Object Name,ProcessId); ConvertTo-Json -InputObject $items -Compress`],{encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,'').trim());
if(active.length)throw Error('Test process still running');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(sha(path.join(target,'candidate.rules'))!=='4ec0f3c9bb399b9489c1d6ebf18f176ec81b9de3fbd20c3dee4fc5f370b7a5b1')throw Error('Scratch candidate mismatch');
const junction=path.join(target,'functions-local/node_modules');
if(!fs.lstatSync(junction).isSymbolicLink()||fs.realpathSync(junction).toLowerCase()!==fs.realpathSync(path.join(root,'functions/node_modules')).toLowerCase())throw Error('Unexpected dependency junction');
const metro=fs.readFileSync(path.join(target,'metro-local.log'),'utf8').split('\n').filter(l=>!/password|idToken|accessToken|refreshToken|Authorization|Bearer |AIza[\w-]+/i.test(l)).join('\n');
fs.writeFileSync(path.join(docs,'metro-local.log'),metro,{flag:'wx'});
// Remove the verified junction itself; never traverse or remove its project target.
fs.rmdirSync(junction);
const files=[];function inspect(p){const stat=fs.lstatSync(p);if(stat.isSymbolicLink())throw Error('Unexpected scratch link');if(stat.isDirectory())for(const n of fs.readdirSync(p))inspect(path.join(p,n));else if(stat.isFile())files.push({path:path.relative(target,p),bytes:stat.size,sha256:sha(p)});else throw Error('Unsupported scratch file');}
inspect(target);fs.rmSync(target,{recursive:true,force:false});
const result={at:new Date().toISOString(),target,removed:!fs.existsSync(target),syntheticCredentialsRemoved:true,dependencyJunctionRemovedWithoutFollowing:true,files,backupsPreserved:true};
fs.writeFileSync(path.join(docs,'device-runtime-cleanup.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({removed:result.removed,syntheticCredentialsRemoved:true,dependencyJunctionRemovedWithoutFollowing:true},null,2));
