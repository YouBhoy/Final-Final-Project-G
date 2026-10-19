// Authorized debug update only. Never uninstall, clear data or target another device.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7c'),adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe'),pkg='com.spartang.mobile';
const before=JSON.parse(fs.readFileSync(path.join(docs,'device-preflight.json'),'utf8'));
const text=n=>{const b=fs.readFileSync(path.join(docs,n));return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8');};
const cert=n=>text(n).match(/certificate SHA-256 digest: ([a-f0-9]{64})/)?.[1];
if(!cert('apk-signature.txt')||cert('apk-signature.txt')!==cert('installed-apk-signature.txt'))throw Error('Signature mismatch; no install');
if(!text('apk-badging.txt').includes("name='com.spartang.mobile' versionCode='1' versionName='1.0.0'"))throw Error('Unexpected APK identity/version');
if(!require('./device-firewall.cjs').status().isolated)throw Error('Verified Phase 7C isolation required before package-update receiver can run');
function run(args){const r=cp.spawnSync(adb,['-s','emulator-5554',...args],{windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000});
 fs.appendFileSync(path.join(docs,'device-commands.jsonl'),JSON.stringify({at:new Date().toISOString(),args:['-s','emulator-5554',...args],code:r.status})+'\n');if(r.status!==0)throw Error(`ADB failed: ${r.stderr}`);return r.stdout.trim();}
if(run(['shell','getprop','ro.boot.qemu'])!=='1'||run(['shell','getconf','PAGE_SIZE'])!=='16384')throw Error('Unexpected device');
run(['shell','am','force-stop',pkg]);
const installOutput=run(['install','-r','--no-incremental',path.join(root,'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk')]);
if(!installOutput.includes('Success'))throw Error('Install not confirmed');
run(['shell','am','force-stop',pkg]);
const dataInode=run(['shell',`run-as ${pkg} stat -c %i .`]);
const dataHashes=run(['shell',`run-as ${pkg} sh -c 'find files shared_prefs -type f -exec sha256sum {} \\;'`]).split(/\r?\n/).sort();
const changedOrRemoved=before.dataHashes.filter(v=>!dataHashes.includes(v)),addedOrChanged=dataHashes.filter(v=>!before.dataHashes.includes(v));
const result={at:new Date().toISOString(),serial:before.serial,pkg,installOutput,command:'adb -s emulator-5554 install -r --no-incremental <local debug APK>',sameSigner:true,dataInode,dataInodeUnchanged:dataInode===before.dataInode,changedOrRemoved,addedOrChanged,previousFileCount:before.dataHashes.length,currentFileCount:dataHashes.length,appStopped:true,appLaunched:false,uninstallOrDataClear:false,isolation:require('./device-firewall.cjs').status().isolated};
fs.writeFileSync(path.join(docs,'install-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));if(!result.dataInodeUnchanged||changedOrRemoved.length||!result.isolation)process.exitCode=1;
