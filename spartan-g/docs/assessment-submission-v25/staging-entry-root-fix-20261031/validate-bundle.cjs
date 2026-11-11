'use strict';
// One offline JS export, using the Windows Gradle task's relative entry arguments.
// Never invokes Gradle, Hermes compilation, signing, APK packaging or an app runtime.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),p=require(path.join(root,'apps/mobile/staging/profile.cjs')),offline=path.join(__dirname,'../hosted-bootstrap-inspection-20261031/offline.cjs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const check=(v,c)=>{if(!v)throw Error(c);};
function canonicalSource(source){
 const value=source.replaceAll('\\','/');
 // Metro's source names start with a virtual / relative to its server root.
 // Preserve real drive-qualified Windows paths; resolve virtual names from mobile.
 return /^[a-z]:\//i.test(value)?path.resolve(value):path.resolve(p.mobile,value.replace(/^\/+/,''));
}
async function main(){
 if(process.argv.length===3&&process.argv[2]==='--audit-existing-js'){
  const file=path.join(__dirname,'BUNDLE_RESULT.json'),report=JSON.parse(fs.readFileSync(file));
  check(report.exitCode===0&&report.gradleInvocations===0&&report.hermesCompilerInvocations===0&&report.apkCompiled===false,'successful_js_export_required');
  check(path.dirname(report.outputDirectory)===os.tmpdir()&&path.basename(report.outputDirectory).startsWith('spartang-staging-entry-bundle-'),'js_output_path_invalid');
  fs.copyFileSync(file,path.join(__dirname,'BUNDLE_RESULT.before-audit.json'),fs.constants.COPYFILE_EXCL);
  report.initialAuditStopCode=report.stopCode;delete report.stopCode;
  try{auditRelease(report,p.readGoogleServices(p.defaultGoogleServices()));}catch(e){report.status='FAIL';report.stopCode=/^[a-z0-9_]+$/.test(e.message)?e.message:'existing_js_audit_failed';process.exitCode=1;}
  fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));return;
 }
 check(process.argv.length===3&&process.argv[2]==='--validate-js-once','explicit_js_only_mode_required');check(process.version==='v22.23.3','verified_node_required');
 const marker=path.join(__dirname,'BUNDLE_ATTEMPT.json');check(!fs.existsSync(marker),'js_export_attempt_consumed');
 check(execFileSync('git',['branch','--show-current'],{cwd:root,windowsHide:true,encoding:'utf8'}).trim()==='app','app_branch_required');
 const selected=p.readGoogleServices(p.defaultGoogleServices()),env=p.environment(selected.config,selected.googleServicesPath);p.assertEnvironment(env);
 const cli=require.resolve('@expo/cli',{paths:[p.mobile]}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'spartang-staging-entry-bundle-')),bundle=path.join(dir,'index.android.bundle'),map=path.join(dir,'index.android.bundle.map'),assets=path.join(dir,'assets');
 const args=['--require',offline,cli,'export:embed','--platform','android','--dev','false','--reset-cache','--entry-file','index.ts','--bundle-output',bundle,'--assets-dest',assets,'--sourcemap-output',map,'--minify','false','--max-workers','2'];
 const report={status:'running',workingDirectory:p.mobile,metroProjectRoot:p.mobile,metroServerRoot:p.mobile,entryArgument:'index.ts',absoluteEntry:path.join(p.mobile,'index.ts'),outputDirectory:dir,command:'installed Expo export:embed; Android release JS only',apkCompiled:false,apkSigned:false,gradleInvocations:0,hermesCompilerInvocations:0,signingMaterialRead:false,serviceAccountCredentialsRead:false,automaticRetries:0};
 fs.writeFileSync(marker,JSON.stringify({workingDirectory:p.mobile,relativeEntry:'index.ts',jsExports:1,nativeBuilds:0},null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(__dirname,'BUNDLE_RESULT.json'),JSON.stringify(report,null,2)+'\n');
 try{
  const child=spawnSync(process.execPath,args,{cwd:p.mobile,env,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:4*1024*1024});report.exitCode=child.status;
  const log=((child.stdout||'')+'\n'+(child.stderr||'')).replace(/AIza[A-Za-z0-9_-]{35}/g,'<public-firebase-key-redacted>');fs.writeFileSync(path.join(__dirname,'JS_BUNDLE.log'),log,{flag:'wx'});
  check(!child.error&&child.status===0,'offline_release_js_export_failed');check(fs.existsSync(bundle)&&fs.existsSync(map),'release_js_artifacts_missing');
  auditRelease(report,selected);
 }catch(e){report.status='FAIL';report.stopCode=/^[a-z0-9_]+$/.test(e.message)?e.message:'local_bundle_validation_failed';process.exitCode=1;}
 finally{fs.writeFileSync(path.join(__dirname,'BUNDLE_RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
}
function auditRelease(report,selected){
  const bundle=path.join(report.outputDirectory,'index.android.bundle'),map=path.join(report.outputDirectory,'index.android.bundle.map');
  const bytes=fs.readFileSync(bundle),text=bytes.toString('utf8'),sourceMap=JSON.parse(fs.readFileSync(map)),sources=sourceMap.sources.map(s=>path.relative(root,canonicalSource(s)).replaceAll('\\','/'));
  check(bytes.subarray(0,8).toString('hex')!=='c61fbc03c103191f','unexpected_hermes_bytecode');
  const required=['apps/mobile/index.ts','apps/mobile/src/app/App.tsx','apps/mobile/src/navigation/RootNavigator.tsx','apps/mobile/src/navigation/StudentNavigator.tsx','apps/mobile/src/navigation/FacilitatorNavigator.tsx','apps/mobile/src/security/AppSecurityBoundary.tsx',
   'apps/mobile/src/screens/assessment/TemplateAssessmentScreen.tsx','apps/mobile/src/screens/dashboard/DashboardScreen.tsx','apps/mobile/src/screens/student/GardenScreen.tsx','apps/mobile/src/screens/student/ForestScreen.tsx',
   'apps/mobile/staging/env.native.ts','apps/mobile/staging/contract.ts','apps/mobile/staging/submission-http.ts','apps/mobile/staging/messaging.ts','apps/mobile/staging/NotificationCoordinator.tsx','apps/mobile/staging/NotificationSettings.tsx'];
  for(const file of required){const index=sources.findIndex(s=>s.endsWith('/'+file)||s===file);check(index>=0,'required_release_source_missing');check(sourceMap.sourcesContent?.[index]===fs.readFileSync(path.join(root,file),'utf8'),'release_source_identity_mismatch');}
  const forbidden=sources.filter(s=>/packages\/shared-services\/src\/config\/(?:env(?:\.normal)?\.native|env\.web|env|firebase-app-id)\.ts$|(?:^|\/)firebase-admin\/|(?:^|\/)@google-cloud\/|(?:^|\/)@firebase\/(?:analytics|messaging)(?:-|\/)|(?:^|\/)expo-notifications\/|(?:^|\/)expo-dev-(?:client|launcher|menu)\/|expo-router\/entry|apps\/mobile\/staging\/(?:profile\.cjs|native\.gradle|Run-StagingBuild\.ps1)$/.test(s));
  check(forbidden.length===0,'unapproved_release_source_present');
  check(text.includes(p.PROJECT)&&text.includes(selected.config.appId),'actual_staging_public_config_not_inlined');check(!text.includes('spartan-g-a2d80'),'production_firebase_identifier_in_js');
  check(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"type"\s*:\s*"service_account"/.test(text),'privileged_material_in_js');
  Object.assign(report,{status:'PASS',bundleBytes:bytes.length,bundleSha256:sha(bytes),sourceMapSha256:sha(fs.readFileSync(map)),sourceCount:sources.length,requiredCurrentSourcesVerified:required.length,sharedServiceSources:sources.filter(s=>s.includes('packages/shared-services/src/')).length,forbiddenSources:0,entryAndSecuritySourcesByteExact:true,stagingPublicConfigInlined:true,productionFirebaseFallbackAbsent:true,submissionAdapter:'disabled staging implementation',notifications:'disabled staging implementations',ai:'disabled resolver',analytics:'excluded from JS graph',cloudRequests:0});
}
module.exports={canonicalSource};
if(require.main===module)main().catch(()=>{console.error('Stopped: local_js_export_setup_failure. No retry.');process.exitCode=1;});
