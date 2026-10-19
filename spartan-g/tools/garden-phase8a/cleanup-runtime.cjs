// Remove only this phase's four disposable emulator working directories after exit.
// Retain cached tooling, prior phases, project files, diagnostic evidence and backups.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase8a'),temporary=fs.realpathSync(os.tmpdir());
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const processes=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command',
 `$items = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'java.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match 'garden-phase8a|garden-phase6c|cloud-firestore-emulator-v1\\.22\\.0' } | Select-Object Name,ProcessId); ConvertTo-Json -InputObject $items -Compress`],
 {encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,'').trim());
if(processes.length)throw Error('Test process still active; no cleanup performed');
const planned=[];
for(const name of fs.readdirSync(docs).filter(n=>/^http-run-\d{8}T\d{6}Z\.json$/.test(n))){
 const record=JSON.parse(fs.readFileSync(path.join(docs,name),'utf8'));
 if(record.project!=='demo-spartan-g-garden-phase2'||record.productionAccess!==false)throw Error('Unexpected test scope');
 for(const result of record.results)if(!fs.existsSync(path.join(docs,result.log)))throw Error('Preserved test log missing');
 const suffix=name.slice('http-run-'.length,-'.json'.length),folder=`spartan-g-garden-phase8a-${suffix}`;
 const directory=path.resolve(temporary,folder);
 if(path.dirname(directory).toLowerCase()!==temporary.toLowerCase()||!/^spartan-g-garden-phase8a-\d{8}T\d{6}Z$/.test(path.basename(directory)))throw Error('Unsafe cleanup target');
 if(!fs.existsSync(directory)){planned.push({directory,alreadyAbsent:true});continue;}
 if(fs.realpathSync(directory).toLowerCase()!==directory.toLowerCase())throw Error('Redirected cleanup directory');
 const files=[];
 function inspect(target){const stat=fs.lstatSync(target);if(stat.isSymbolicLink())throw Error('Linked cleanup entry');
  if(stat.isDirectory())for(const child of fs.readdirSync(target))inspect(path.join(target,child));
  else if(stat.isFile())files.push({path:path.relative(directory,target),bytes:stat.size});else throw Error('Unexpected cleanup entry');}
 inspect(directory);
 if(!fs.existsSync(path.join(directory,'candidate.rules'))&&!fs.existsSync(path.join(directory,'firebase.json'))&&files.length===0){
  planned.push({directory,files,initializationFailedBeforeConfigCopy:true});continue;
 }
 if(hash(path.join(directory,'candidate.rules'))!=='4ec0f3c9bb399b9489c1d6ebf18f176ec81b9de3fbd20c3dee4fc5f370b7a5b1')throw Error('Unexpected scratch rules');
 const config=JSON.parse(fs.readFileSync(path.join(directory,'firebase.json'),'utf8'));
 if(config.emulators?.auth?.host!=='127.0.0.1'||config.emulators?.auth?.port!==19097
  ||config.emulators?.firestore?.host!=='127.0.0.1'||config.emulators?.firestore?.port!==18088)throw Error('Unexpected scratch configuration');
 planned.push({directory,files});
}
// All resolved absolute targets validated before any recursive removal.
for(const target of planned)if(!target.alreadyAbsent){fs.rmSync(target.directory,{recursive:true,force:false});target.removed=!fs.existsSync(target.directory);}
const result={at:new Date().toISOString(),passed:planned.every(p=>p.alreadyAbsent||p.removed),remainingTestProcesses:processes,
 removedDirectories:planned.filter(p=>p.removed).length,targets:planned,previousPhaseDirectoriesAndToolCachesPreserved:true};
const stamp=result.at.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
fs.writeFileSync(path.join(docs,`runtime-cleanup-${stamp}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:result.passed,removedDirectories:result.removedDirectories,
 remainingTestProcesses:processes,targets:planned.map(p=>({directory:p.directory,removed:p.removed,alreadyAbsent:p.alreadyAbsent}))},null,2));
if(!result.passed)process.exitCode=1;
