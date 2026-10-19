// Repair only the unintended timing-summary write made by the original legacy test.
// Require an exact initial-checkpoint hash match before restoring any bytes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7a');
const baseline=JSON.parse(fs.readFileSync(path.join(docs,'preservation-before.json'),'utf8'));
const relative='docs/garden-phase6c/platform-health-timing.json',target=path.join(root,relative);
const expected=baseline.entries.find(e=>e.path===relative)?.sha256;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(!expected)throw Error('Missing original checkpoint');
const current=fs.readFileSync(target);if(hash(current)===expected){console.log('Original timing evidence already preserved');process.exit(0);}
let original;
// Known serialization from the unchanged original test; no value is accepted without SHA-256 equality.
search:for(let samples=1;samples<=200;samples++)for(let maximumMs=0;maximumMs<=20000;maximumMs++){
 const bytes=Buffer.from(JSON.stringify({samples,maximumMs,allHttp200:true},null,2)+'\n');
 if(hash(bytes)===expected){original=bytes;break search;}
}
if(!original)throw Error('Exact original bytes unavailable; nothing changed');
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const archive=`platform-health-timing-final-${stamp}.json`;
fs.writeFileSync(path.join(docs,archive),current,{flag:'wx'});
// Recheck against a concurrent edit before restoring the verified initial bytes.
if(hash(fs.readFileSync(target))!==hash(current))throw Error('Concurrent timing edit detected; stop');
fs.writeFileSync(target,original);
if(hash(fs.readFileSync(target))!==expected)throw Error('Restoration verification failed');
const evidence={at:new Date().toISOString(),file:relative,archivedPhase7Timing:archive,
 originalSha256:expected,restoredSha256:hash(fs.readFileSync(target)),exactOriginalRestored:true,
 sourceOrBackupFilesChanged:false};
fs.writeFileSync(path.join(docs,'timing-restoration.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(evidence,null,2));
