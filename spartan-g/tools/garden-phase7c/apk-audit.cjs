// Offline artifact comparison. Do not print configuration, credentials or asset contents.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7c');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function zip(file){const b=fs.readFileSync(file);let end=b.length-22;while(end>=Math.max(0,b.length-65557)&&b.readUInt32LE(end)!==0x06054b50)end--;if(end<0)throw Error('ZIP end missing');
 const entries=new Map();let pos=b.readUInt32LE(end+16);for(let i=0;i<b.readUInt16LE(end+10);i++){
  if(b.readUInt32LE(pos)!==0x02014b50)throw Error('Bad ZIP directory');const method=b.readUInt16LE(pos+10),length=b.readUInt32LE(pos+20),n=b.readUInt16LE(pos+28),extra=b.readUInt16LE(pos+30),comment=b.readUInt16LE(pos+32),local=b.readUInt32LE(pos+42),name=b.toString('utf8',pos+46,pos+46+n);
  const offset=local+30+b.readUInt16LE(local+26)+b.readUInt16LE(local+28),data=b.subarray(offset,offset+length);entries.set(name,{method,offset,read:()=>method===0?data:method===8?zlib.inflateRawSync(data):(()=>{throw Error('Unsupported ZIP method');})()});pos+=46+n+extra+comment;
 }return {bytes:b.length,sha256:sha(b),entries};}
const currentFile=path.join(root,'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk'),before=JSON.parse(fs.readFileSync(path.join(docs,'device-preflight.json'),'utf8'));
const current=zip(currentFile),previous=zip(before.installedBackup),resources=[],libs=[];
for(const [name,e]of current.entries){if(name.startsWith('res/')||name.startsWith('assets/')||name.startsWith('lib/')){
 const data=e.read(),old=previous.entries.get(name),record={name,sha256:sha(data),previouslyPresent:!!old,unchanged:!!old&&sha(old.read())===sha(data)};
 if(name.endsWith('.so')){const is64=data[4]===2,loads=[];if(is64){if(data[5]!==1)throw Error('Unsupported ELF endianness');const offset=Number(data.readBigUInt64LE(32)),size=data.readUInt16LE(54),count=data.readUInt16LE(56);
  for(let i=0;i<count;i++){const p=offset+i*size;if(data.readUInt32LE(p)===1){const fileOffset=Number(data.readBigUInt64LE(p+8)),address=Number(data.readBigUInt64LE(p+16)),align=Number(data.readBigUInt64LE(p+48));loads.push({fileOffset,address,align,compatible16k:align>=16384&&fileOffset%16384===address%16384});}}}
  libs.push({...record,elf64:is64,loads,zipStored:e.method===0,zip16k:e.method!==0||e.offset%16384===0});
 }else resources.push(record);
}}
const removedResources=[...previous.entries.keys()].filter(n=>/^(res|assets|lib)\//.test(n)&&!current.entries.has(n));
const dex=[...current.entries].filter(([n])=>/^classes\d*\.dex$/.test(n)).map(([n,e])=>({name:n,data:e.read()}));
const previousDex=[...previous.entries].filter(([n])=>/^classes\d*\.dex$/.test(n)).map(([n,e])=>({name:n,data:e.read()}));
const bridgeClasses=['GardenHttpClient','GardenHttpModule','GardenHttpPackage','GardenHttpSettings'].map(n=>({name:n,present:dex.some(e=>e.data.includes(Buffer.from(`Lcom/spartang/mobile/garden/${n};`))),presentInPriorApk:previousDex.some(e=>e.data.includes(Buffer.from(`Lcom/spartang/mobile/garden/${n};`)))}));
const dexComparison=dex.map(e=>({name:e.name,sha256:sha(e.data),unchanged:previousDex.some(old=>old.name===e.name&&sha(old.data)===sha(e.data))}));
const result={at:new Date().toISOString(),apk:{path:path.relative(root,currentFile),bytes:current.bytes,sha256:current.sha256},previousApkSha256:previous.sha256,bridgeClasses,dexComparison,
 resourceCount:resources.length,resourceChanges:resources.filter(r=>!r.unchanged),removedResources,nativeLibraries:libs,
 nativeLibrariesUnchanged:libs.every(r=>r.unchanged),zip16k:libs.every(r=>r.zip16k),elf64Load16k:libs.filter(r=>r.elf64).every(r=>r.loads.length>0&&r.loads.every(l=>l.compatible16k)),
 applicationAssetsBundled:current.entries.has('assets/index.android.bundle'),androidRuntimeValidated:false};
result.passed=result.bridgeClasses.every(c=>c.present)&&result.nativeLibrariesUnchanged&&result.zip16k&&result.elf64Load16k&&removedResources.length===0;
fs.writeFileSync(path.join(docs,'apk-audit.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,nativeLibraries:`${libs.length} libraries; details in apk-audit.json`},null,2));if(!result.passed)process.exitCode=1;
