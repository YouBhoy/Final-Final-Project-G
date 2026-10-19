// Remove only owned, exited host-JVM fixture output/test TLS secrets. No project/cache/backup removal.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7b'),temporary=fs.realpathSync(os.tmpdir());
const before=JSON.parse(fs.readFileSync(path.join(docs,'preservation-before.json'),'utf8'));
const own=new Set(fs.readdirSync(docs).filter(n=>/^jvm-attempt-.*\.json$/.test(n)).map(n=>JSON.parse(fs.readFileSync(path.join(docs,n),'utf8')).runtime.toLowerCase()));
const active=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command',
 `$items = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'java.exe'" | Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match 'phase7b|cloud-firestore-emulator-v1\\.22\\.0' } | Select-Object Name,ProcessId); ConvertTo-Json -InputObject $items -Compress`],
 {encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,'').trim());if(active.length)throw Error('Test process still active; cleanup refused');
const targets=[];
for(const name of fs.readdirSync(temporary).filter(n=>/^spartan-g-phase7b-native-\d{8}T\d{6}Z-[a-z0-9]{6}$/i.test(n))){
 const directory=path.resolve(temporary,name),actual=fs.realpathSync(directory);
 if(path.dirname(actual).toLowerCase()!==temporary.toLowerCase()||actual.toLowerCase()!==directory.toLowerCase())throw Error('Unsafe resolved target');
 const known=own.has(directory.toLowerCase()),children=fs.readdirSync(directory);
 if(!known){if(children.length||fs.statSync(directory).birthtimeMs<Date.parse(before.at))throw Error('Unowned/nonempty scratch directory');targets.push({directory,emptyFailedSetup:true,files:[]});continue;}
 if(children.some(n=>!['classes.jar','core-classes','bridge-classes','test-tls.p12','test-key.pem','test-cert.pem'].includes(n)))throw Error('Unexpected scratch content');
 const files=[];function inspect(p){const stat=fs.lstatSync(p);if(stat.isSymbolicLink())throw Error('Linked scratch content');if(stat.isDirectory())for(const n of fs.readdirSync(p))inspect(path.join(p,n));
  else if(stat.isFile())files.push({path:path.relative(directory,p),bytes:stat.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')});else throw Error('Unsupported scratch entry');}
 inspect(directory);targets.push({directory,files});
}
// Every absolute target and its ownership/content validated before removal, all within TEMP.
for(const target of targets){if(target.emptyFailedSetup)fs.rmdirSync(target.directory);else fs.rmSync(target.directory,{recursive:true,force:false});target.removed=!fs.existsSync(target.directory);}
const at=new Date().toISOString(),stamp=at.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),result={at,passed:targets.every(t=>t.removed),
 removedDirectories:targets.length,targets,testSecretsRemoved:true,toolCachesAndBackupsPreserved:true};
fs.writeFileSync(path.join(docs,`native-runtime-cleanup-${stamp}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:result.passed,removedDirectories:targets.length,testSecretsRemoved:true},null,2));
