// Read-only emulator/package checks and preservation of the installed debug APK.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7c'),adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
const serial='emulator-5554',pkg='com.spartang.mobile';
function run(args){const r=cp.spawnSync(adb,['-s',serial,...args],{windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024});fs.appendFileSync(path.join(docs,'device-commands.jsonl'),JSON.stringify({at:new Date().toISOString(),args:['-s',serial,...args],code:r.status})+'\n');if(r.status!==0)throw Error('Read-only device preflight failed');return r.stdout.trim();}
const prop=name=>run(['shell','getprop',name]);
const boot=prop('sys.boot_completed'),qemu=prop('ro.boot.qemu'),abi=prop('ro.product.cpu.abi'),api=prop('ro.build.version.sdk'),pageBytes=run(['shell','getconf','PAGE_SIZE']);
if(boot!=='1'||qemu!=='1'||abi!=='x86_64'||api!=='35'||pageBytes!=='16384')throw Error('Expected booted 16 KB emulator required');
const uidLine=run(['shell','cmd','package','list','packages','-U',pkg]),match=uidLine.match(/^package:com\.spartang\.mobile uid:(\d+)$/);
if(!match||Number(match[1])<10000)throw Error('Existing package UID missing');const uid=match[1];
const owners=run(['shell','cmd','package','list','packages','--uid',uid,'-U']);if(owners!==uidLine)throw Error('Shared application UID');
const packageInfo=run(['shell','dumpsys','package',pkg]).split(/\r?\n/).filter(l=>/versionCode=|versionName=|firstInstallTime=|lastUpdateTime=|dataDir=|pkgFlags=|User 0:/.test(l));
const dataInode=run(['shell',`run-as ${pkg} stat -c %i .`]);
const dataHashes=run(['shell',`run-as ${pkg} sh -c 'find files shared_prefs -type f -exec sha256sum {} \\;'`]).split(/\r?\n/).sort();
const installedPath=run(['shell','pm','path',pkg]).replace(/^package:/,'');if(!/^\/data\/app\/.+\/base\.apk$/.test(installedPath))throw Error('Unexpected APK path');
const checkpoint=JSON.parse(fs.readFileSync(path.join(docs,'preservation-before.json'),'utf8'));
const installedBackup=path.join(checkpoint.backupDir,'installed-base.apk');
if(!fs.existsSync(installedBackup))run(['pull',installedPath,installedBackup]);
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const result={at:new Date().toISOString(),serial,pkg,boot,qemu,abi,api,pageBytes:Number(pageBytes),uid,uniqueUid:true,packageInfo,dataInode,dataHashes,installedPath,installedBackup,installedApkSha256:sha(installedBackup),appLaunched:false,dataReadAsHashesOnly:true};
fs.writeFileSync(path.join(docs,'device-preflight.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...result,dataHashes:`${dataHashes.length} file hashes recorded; contents not collected`},null,2));
