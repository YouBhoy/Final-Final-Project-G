// Existing JDK only. Generate private material solely in a unique, owned TEMP directory.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7d'),jdk='C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.20.101-hotspot';
const before=JSON.parse(fs.readFileSync(path.join(docs,'preservation-before.json'),'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const p of before.possibleChanges)if(hash(path.join(root,p))!==before.entries.find(e=>e.path===p).sha256||hash(path.join(root,before.nativeBackupDir,p))!==before.entries.find(e=>e.path===p).sha256)throw Error('Original source/backup mismatch');
const helper='apps/mobile/android/app/src/debug/java/com/spartang/mobile/garden/GardenPhase7dFixture.kt',asset='apps/mobile/android/app/src/debug/assets/garden-phase7d-cert.pem';
if([helper,asset].some(p=>fs.existsSync(path.join(root,p)))||fs.existsSync(path.join(docs,'tls-runtime.json')))throw Error('Existing Phase 7D fixture must not be overwritten');
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'spartan-g-phase7d-tls-'));
fs.writeFileSync(path.join(docs,'tls-attempt.json'),JSON.stringify({at:new Date().toISOString(),runtime,owner:'phase7d',helper,asset},null,2)+'\n',{flag:'wx'});
function run(name,exe,args){const r=cp.spawnSync(exe,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fs.writeFileSync(path.join(docs,name+'.log'),(r.stdout||'')+(r.stderr||''),{flag:'wx'});if(r.status!==0)throw Error('Existing JDK fixture setup failed: '+name);}
run('compile-tls-exporter',path.join(jdk,'bin/javac.exe'),['--release','17','-d',runtime,path.join(__dirname,'ExportTestTls.java')]);
const certificates={};for(const name of ['trusted','untrusted']){
 const store=path.join(runtime,name+'.p12'),prefix=path.join(runtime,name);
 run('generate-'+name+'-tls',path.join(jdk,'bin/keytool.exe'),['-genkeypair','-alias','local','-keyalg','RSA','-keysize','2048','-sigalg','SHA256withRSA','-validity','2','-storetype','PKCS12','-keystore',store,'-storepass','synthetic-local-only','-keypass','synthetic-local-only','-dname','CN=10.0.2.2','-ext','SAN=IP:10.0.2.2,IP:127.0.0.1,DNS:localhost','-noprompt']);
 run('export-'+name+'-tls',path.join(jdk,'bin/java.exe'),['-cp',runtime,'ExportTestTls',store,prefix]);
 const cert=new crypto.X509Certificate(fs.readFileSync(prefix+'-cert.pem')),pin='sha256/'+crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
 certificates[name]={fingerprint256:cert.fingerprint256,validFrom:cert.validFrom,validTo:cert.validTo,pin};
}
const source=fs.readFileSync(path.join(__dirname,'GardenPhase7dFixture.kt.template'),'utf8').replace('__FIXTURE_PIN__',certificates.trusted.pin);
for(const p of [helper,asset])fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});
fs.writeFileSync(path.join(root,helper),source,{flag:'wx'});fs.copyFileSync(path.join(runtime,'trusted-cert.pem'),path.join(root,asset),fs.constants.COPYFILE_EXCL);
const result={at:new Date().toISOString(),runtime,certificates,helper,asset,helperSha256:hash(path.join(root,helper)),assetSha256:hash(path.join(root,asset)),globalTrustChanged:false,origin:'https://10.0.2.2:19098'};
fs.writeFileSync(path.join(docs,'tls-runtime.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({runtime,origin:result.origin,certificates,globalTrustChanged:false},null,2));
