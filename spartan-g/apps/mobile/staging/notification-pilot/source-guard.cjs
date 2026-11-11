'use strict';
// A separately reviewed staging inventory; never enroll or rewrite sources at build time.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function verifyPilotSources({root,bytes,checksum,head,branch}){
 const check=(value,code)=>{if(!value)throw Error(code);};
 check(/^[a-f0-9]{64}\s+VALIDATED_SOURCE\.json\s*$/.test(checksum)&&checksum.slice(0,64)===sha(bytes),'staging_manifest_checksum_invalid');
 const state=JSON.parse(bytes.toString('utf8'));
 check(state.passed===true&&state.profile==='staging-v25'&&state.apkBuilt===false&&state.project==='spartan-g-assessment-staging'
  &&state.applicationId==='com.spartang.mobile.staging'&&state.versionCode===25&&Array.isArray(state.files)&&state.files.length>50,'staging_validation_metadata_invalid');
 check(branch==='app'&&head===state.appHead,'staging_validated_app_head_changed');
 const seen=new Set(),realRoot=fs.realpathSync(root);
 for(const file of state.files){
  check(typeof file?.path==='string'&&!file.path.includes('\\')&&!file.path.includes(':')&&!file.path.split('/').some(p=>!p||p==='.'||p==='..')
   &&/^[a-f0-9]{64}$/.test(file.sha256),'staging_validated_source_invalid');
  const key=file.path.toLowerCase();check(!seen.has(key),'staging_validated_source_duplicate');seen.add(key);
  const resolved=path.resolve(root,file.path),real=fs.realpathSync(resolved),rel=path.relative(realRoot,real);
  check(!path.isAbsolute(rel)&&rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!fs.lstatSync(resolved).isSymbolicLink(),'staging_validated_source_invalid');
  check(sha(fs.readFileSync(resolved))===file.sha256,'staging_validated_source_changed');
 }
 for(const required of ['apps/mobile/staging/profile.cjs','apps/mobile/staging/resolver.cjs','apps/mobile/staging/native.gradle','apps/mobile/staging/Run-StagingBuild.ps1',
  ...['candidate.json','runtime.ts','policy.ts','resolve.cjs','Coordinator.tsx','source-guard.cjs'].map(f=>'apps/mobile/staging/notification-pilot/'+f)]){
  check(seen.has(required.toLowerCase()),'staging_required_source_missing');
 }
 return state;
}
module.exports={verifyPilotSources};
