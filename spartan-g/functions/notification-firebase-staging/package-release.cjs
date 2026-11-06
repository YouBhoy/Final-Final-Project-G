'use strict';
// Local deterministic packaging only. No install, CLI, upload or cloud operation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pins={'firebase-admin':'12.7.0','firebase-functions':'6.6.0','google-auth-library':'9.15.1'};
async function packageRelease(destination){
 const target=path.resolve(destination);if(fs.existsSync(target))throw Error('Never overwrite a release directory');
 const esbuild=require(require.resolve('esbuild',{paths:[root]}));if(esbuild.version!=='0.21.5')throw Error('Unreviewed bundler');
 const lock=JSON.parse(fs.readFileSync(path.join(root,'functions/package-lock.json')));
 const dependencies={},kept=new Map();
 function resolve(name,from=''){
  let current=from;
  for(;;){const candidate=(current?current+'/':'')+'node_modules/'+name;if(lock.packages[candidate])return candidate;if(!current)break;const i=current.lastIndexOf('/node_modules/');current=i<0?'':current.slice(0,i);}
  throw Error('Missing locked dependency '+name);
 }
 function visit(key){if(kept.has(key))return;const item=lock.packages[key];if(!item?.integrity||!item.resolved?.startsWith('https://registry.npmjs.org/'))throw Error('Non-registry dependency');kept.set(key,item);
  for(const name of new Set([...Object.keys(item.dependencies??{}),...Object.keys(item.optionalDependencies??{}),...Object.keys(item.peerDependencies??{})])){
   try{visit(resolve(name,key));}catch(error){if(item.peerDependenciesMeta?.[name]?.optional||Object.hasOwn(item.optionalDependencies??{},name))continue;throw error;}
  }
 }
 for(const [name,version] of Object.entries(pins)){const key=resolve(name);if(lock.packages[key].version!==version||require(path.join(root,'functions',key,'package.json')).version!==version)throw Error('Installed/locked dependency drift');dependencies[name]=version;visit(key);}
 const manifest={name:'spartan-g-notifications-staging-disabled',version:'0.0.0-disabled.20261106',private:true,main:'index.js',engines:{node:'22'},dependencies};
 const packageLock={name:manifest.name,version:manifest.version,lockfileVersion:3,requires:true,packages:{'':{name:manifest.name,version:manifest.version,dependencies,engines:manifest.engines},...Object.fromEntries([...kept].sort(([a],[b])=>a.localeCompare(b)))}};
 const base={bundle:true,write:false,platform:'node',format:'cjs',target:'node22',sourcemap:false,minify:false,treeShaking:false,legalComments:'none',logLevel:'silent',external:['firebase-admin/*','firebase-functions/*','google-auth-library']};
 const disabled=await esbuild.build({...base,entryPoints:[path.join(__dirname,'disabled-entry.ts')],metafile:true});
 const prepared=await esbuild.build({...base,entryPoints:[path.join(__dirname,'firebase-adapter.ts')],metafile:true});
 const sourceInputs=[...new Set([...Object.keys(disabled.metafile.inputs),...Object.keys(prepared.metafile.inputs)])].sort();
 if(sourceInputs.some(f=>/functions[\\/]src[\\/]|notification-staging[\\/]host|apps[\\/]web/.test(f)))throw Error('Unexpected source graph');
 const config={functions:[{source:'backend',codebase:'notifications-staging',runtime:'nodejs22',ignore:['node_modules','.git','*.log']} ]};
 const files={
  'firebase.json':JSON.stringify(config,null,2)+'\n',
  '.firebaserc':JSON.stringify({projects:{default:'spartan-g-assessment-staging'}},null,2)+'\n',
  'backend/package.json':JSON.stringify(manifest,null,2)+'\n',
  'backend/package-lock.json':JSON.stringify(packageLock,null,2)+'\n',
  'backend/index.js':disabled.outputFiles[0].text,
  'backend/prepared.js':prepared.outputFiles[0].text,
  'backend/.env.spartan-g-assessment-staging':'NOTIFICATIONS_FIREBASE_STAGING_ENABLED=false\n',
  'RELEASE.json':JSON.stringify({project:'spartan-g-assessment-staging',database:'(default)',codebase:'notifications-staging',mode:'immutable-disabled',exportedFunctions:['notificationDeviceApi'],sourceApproved:false,scheduler:false,triggers:false,productionAccess:false,serviceAccount:'spartan-g-staging-notify@spartan-g-assessment-staging.iam.gserviceaccount.com',sourceInputs:sourceInputs.map(f=>({path:f.replaceAll('\\','/'),sha256:sha(fs.readFileSync(path.resolve(root,f)))})),dependencies:pins,bundler:'esbuild 0.21.5'},null,2)+'\n',
 };
 for(const [name,contents]of Object.entries(files)){const file=path.join(target,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents,{flag:'wx'});}
 const inventory=Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([name,contents])=>({path:name,bytes:Buffer.byteLength(contents),sha256:sha(contents)}));
 fs.writeFileSync(path.join(target,'INVENTORY.json'),JSON.stringify({algorithm:'SHA-256',excludesSelf:true,files:inventory},null,2)+'\n',{flag:'wx'});
 return{directory:target,files:inventory,dependencies:kept.size,sourceInputs:sourceInputs.length};
}
module.exports={packageRelease};
if(require.main===module)packageRelease(process.argv[2]).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Local packaging failed; preserve partial output');process.exitCode=1;});
