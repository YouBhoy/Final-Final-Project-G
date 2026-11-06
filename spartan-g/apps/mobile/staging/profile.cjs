'use strict';
// Local-only configuration and planning. This module never compiles or loads signing credentials.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),mobile=path.resolve(__dirname,'..');
const {readProfile}=require('./resolver.cjs');
const ts=require(require.resolve('typescript',{paths:[mobile]})),m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'contract.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});
const contract=m.exports,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const check=(v,c)=>{if(!v)throw Error(c);};
const defaultGoogleServices=()=>path.join(os.homedir(),'AppData/Local/SpartanG/staging-android/google-services.json');
function rejectSensitive(text){check(!/-----BEGIN [^-]*PRIVATE KEY-----|"(?:private_key|private_key_id|refresh_token|access_token|client_secret)"\s*:|"type"\s*:\s*"service_account"|spartan-g-a2d80/i.test(text),'sensitive_or_production_configuration_rejected');}
function assertSafeSource(bytes){
 const text=Buffer.isBuffer(bytes)?bytes.toString('utf8'):String(bytes);
 check(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"type"\s*:\s*"service_account"/.test(text),'staging_sensitive_source_rejected');
}
function readGoogleServices(file){
 check(typeof file==='string'&&path.isAbsolute(file)&&path.basename(file)==='google-services.json','staging_google_services_path_invalid');
 const outside=p=>{const rel=path.relative(root,p);return path.isAbsolute(rel)||rel==='..'||rel.startsWith('..'+path.sep);};
 check(outside(path.resolve(file)),'staging_configuration_must_be_outside_checkout');
 check(fs.existsSync(file),'staging_android_registration_configuration_missing');
 const stat=fs.lstatSync(file);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=65536,'staging_google_services_file_invalid');
 check(outside(fs.realpathSync(file)),'staging_configuration_must_be_outside_checkout');
 const text=fs.readFileSync(file,'utf8');rejectSensitive(text);let json;try{json=JSON.parse(text);}catch{throw Error('staging_google_services_json_invalid');}
 return {config:contract.parseGoogleServices(json),googleServicesSha256:sha(Buffer.from(text)),googleServicesPath:fs.realpathSync(file)};
}
function environment(config,googleServicesPath,base=process.env){
 const safe={};for(const key of ['SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'])if(base[key])safe[key]=base[key];
 const nodeDir=path.join(os.tmpdir(),'spartan-g-phase5-node22.23.3/node-v22.23.3-win-x64'),java='C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.20.101-hotspot',sdk=path.join(os.homedir(),'AppData/Local/Android/Sdk');
 Object.assign(safe,{PATH:[nodeDir,path.join(java,'bin'),path.join(base.SystemRoot||'C:\\Windows','System32')].join(path.delimiter),JAVA_HOME:java,ANDROID_HOME:sdk,
  // RN's Windows Gradle command passes index.ts relative to the mobile project.
  // Keep Expo's Metro server rooted there; monorepo watch folders remain enabled.
  CI:'1',EXPO_OFFLINE:'1',EXPO_NO_DOTENV:'1',EXPO_NO_METRO_WORKSPACE_ROOT:'1',NODE_ENV:'production',SPARTAN_ANDROID_PROFILE:contract.PROFILE,EXPO_PUBLIC_SPARTAN_ANDROID_PROFILE:contract.PROFILE,
  EXPO_PUBLIC_APP_ENV:'staging',EXPO_PUBLIC_SPARTAN_STAGING_FIREBASE_CONFIG:JSON.stringify(contract.validateFirebaseOptions(config)),SPARTAN_STAGING_GOOGLE_SERVICES:googleServicesPath,
  GOOGLE_SERVICES_JSON:googleServicesPath,EXPO_PUBLIC_ASSESSMENT_FINALIZER_ENABLED:'false',EXPO_PUBLIC_ASSESSMENT_FINALIZER_URL:'https://'+contract.HOST+'/api/assessment-submit',
  SPARTAN_AI_MODE:'disabled',EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE:'0',EXPO_PUBLIC_SPARTAN_GARDEN_BACKEND:'0',EXPO_PUBLIC_GEMINI_API_KEY:'',EXPO_PUBLIC_GEMINI_ASSISTANT_API_KEY:'',ENTRY_FILE:'index.ts'});
 return safe;
}
function assertEnvironment(env,buildRuntime=false){
 const allowed=['SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','PATH','JAVA_HOME','ANDROID_HOME','CI','EXPO_OFFLINE','EXPO_NO_DOTENV','EXPO_NO_METRO_WORKSPACE_ROOT','NODE_ENV','SPARTAN_ANDROID_PROFILE','EXPO_PUBLIC_SPARTAN_ANDROID_PROFILE','EXPO_PUBLIC_APP_ENV','EXPO_PUBLIC_SPARTAN_STAGING_FIREBASE_CONFIG','SPARTAN_STAGING_GOOGLE_SERVICES','GOOGLE_SERVICES_JSON','EXPO_PUBLIC_ASSESSMENT_FINALIZER_ENABLED','EXPO_PUBLIC_ASSESSMENT_FINALIZER_URL','SPARTAN_AI_MODE','EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE','EXPO_PUBLIC_SPARTAN_GARDEN_BACKEND','EXPO_PUBLIC_GEMINI_API_KEY','EXPO_PUBLIC_GEMINI_ASSISTANT_API_KEY','ENTRY_FILE'];
 check(buildRuntime||Object.keys(env).every(k=>allowed.includes(k)),'staging_unexpected_environment_field');
 check(env.SPARTAN_ANDROID_PROFILE===contract.PROFILE&&env.EXPO_PUBLIC_SPARTAN_ANDROID_PROFILE===contract.PROFILE,'staging_profile_not_selected');
 check(env.EXPO_NO_DOTENV==='1'&&env.EXPO_OFFLINE==='1'&&env.NODE_ENV==='production'&&env.EXPO_PUBLIC_APP_ENV==='staging','staging_build_environment_invalid');
 check(env.EXPO_NO_METRO_WORKSPACE_ROOT==='1'&&env.ENTRY_FILE==='index.ts','staging_entry_root_invalid');
 check(env.EXPO_PUBLIC_ASSESSMENT_FINALIZER_ENABLED==='false'&&env.EXPO_PUBLIC_ASSESSMENT_FINALIZER_URL==='https://'+contract.HOST+'/api/assessment-submit','staging_submission_must_remain_disabled');
 check(env.SPARTAN_AI_MODE==='disabled'&&env.EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE==='0'&&env.EXPO_PUBLIC_SPARTAN_GARDEN_BACKEND==='0','staging_side_effect_setting_invalid');
 check(!Object.keys(env).some(k=>/^VITE_|^EXPO_PUBLIC_FIREBASE_|TOKEN|CREDENTIAL|SERVICE_ACCOUNT|PRIVATE_KEY/.test(k)),'staging_ambient_credentials_or_fallback_rejected');
 let config;try{config=contract.validateFirebaseOptions(JSON.parse(env.EXPO_PUBLIC_SPARTAN_STAGING_FIREBASE_CONFIG));}catch{throw Error('staging_public_configuration_invalid');}
 return config;
}
function expoOverrides(base,env=process.env){
 if(readProfile(env.SPARTAN_ANDROID_PROFILE)==='production')return base;
 // Gradle adds task variables and protected signing variables after the strict launch-plan check.
 // Expo needs only the explicit public staging fields; it never reads those signing values.
 const config=assertEnvironment(env,true),selected=readGoogleServices(env.SPARTAN_STAGING_GOOGLE_SERVICES);
 check(Object.keys(config).every(k=>selected.config[k]===config[k]),'staging_public_and_native_configuration_mismatch');
 return {...base,name:'Spartan-G v25 STAGING',slug:'spartan-g-v25-staging',scheme:contract.SCHEME,updates:{enabled:false},
  android:{...base.android,package:contract.PACKAGE,versionCode:25,googleServicesFile:selected.googleServicesPath},
  extra:{spartanBuildProfile:contract.PROFILE,firebaseProject:contract.PROJECT,assessmentSubmissionEnabled:false}};
}
function stagingManifest(original){
 check(!/<!DOCTYPE|<!ENTITY/.test(original),'staging_manifest_invalid');
 check(original.includes('android:name=".MainApplication"')&&original.includes('android:name=".MainActivity"')&&original.includes('android:label="@string/app_name"'),'production_manifest_baseline_changed');
 let text=original.replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">','<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">')
 .replace('android:name=".MainApplication"','android:name="com.spartang.mobile.MainApplication"').replace('android:name=".MainActivity"','android:name="com.spartang.mobile.MainActivity"')
 .replace('android:label="@string/app_name"','android:label="Spartan-G v25 STAGING"').replace('android:allowBackup="true"','android:allowBackup="false"')
 .replace('android:scheme="spartan-g"','android:scheme="'+contract.SCHEME+'"').replace('android:scheme="com.spartang.mobile"','android:scheme="'+contract.PACKAGE+'"').replace('android:scheme="exp+spartan-g-mobile"','android:scheme="exp+spartan-g-mobile-staging"');
 text=text.replace('</application>',[
  '<meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false" tools:replace="android:value"/>',
  '<meta-data android:name="firebase_analytics_collection_enabled" android:value="false" tools:replace="android:value"/>',
  '<meta-data android:name="firebase_analytics_collection_deactivated" android:value="true" tools:replace="android:value"/>',
  '<meta-data android:name="google_analytics_automatic_screen_reporting_enabled" android:value="false" tools:replace="android:value"/>',
  '<meta-data android:name="firebase_crashlytics_collection_enabled" android:value="false" tools:replace="android:value"/>','</application>'].join('\n'));
 check(!/android:scheme="(?:spartan-g|com\.spartang\.mobile|exp\+spartan-g-mobile)"/.test(text),'staging_deep_link_isolation_failed');
 return text;
}
function validatedSources(){
 const file=path.join(root,'docs/assessment-submission-v25/android-staging-profile-20261031/VALIDATED_SOURCE.json');
 check(fs.existsSync(file),'staging_local_validation_required');const state=JSON.parse(fs.readFileSync(file));
 check(state.passed===true&&state.profile===contract.PROFILE&&state.apkBuilt===false&&Array.isArray(state.files)&&state.files.length>50,'staging_validation_metadata_invalid');
 check(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()==='app','android_app_branch_required');
 check(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()===state.appHead,'staging_validated_app_head_changed');
 for(const f of state.files){const resolved=path.resolve(root,f.path);check(resolved.startsWith(root+path.sep),'staging_validated_source_changed');const bytes=fs.readFileSync(resolved);check(sha(bytes)===f.sha256,'staging_validated_source_changed');assertSafeSource(bytes);}
 return state;
}
function prepare(file){
 check(process.version==='v22.23.3','verified_node_required');validatedSources();
 const selected=readGoogleServices(file),env=environment(selected.config,selected.googleServicesPath);assertEnvironment(env);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spartang-v25-staging-')),google=path.join(dir,'google-services.json'),manifest=path.join(dir,'AndroidManifest.xml');
 fs.copyFileSync(selected.googleServicesPath,google,fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(manifest,stagingManifest(fs.readFileSync(path.join(mobile,'android/app/src/main/AndroidManifest.xml'),'utf8')),{flag:'wx'});
 const plan={profile:contract.PROFILE,projectId:contract.PROJECT,applicationId:contract.PACKAGE,namespace:'com.spartang.mobile',versionCode:25,submissionEnabled:false,notificationSendingEnabled:false,
  manifest,manifestSha256:sha(fs.readFileSync(manifest)),googleServices:google,googleServicesSha256:selected.googleServicesSha256,androidAppId:selected.config.appId,
  appBuildDirectory:path.join(mobile,'android/app',path.basename(dir)),sourceRoot:root,sourceValidation:path.join(root,'docs/assessment-submission-v25/android-staging-profile-20261031/VALIDATED_SOURCE.json')};
 plan.sourceValidationSha256=sha(fs.readFileSync(plan.sourceValidation));
 const planPath=path.join(dir,'contract.json');fs.writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(dir,'environment.json'),JSON.stringify(environment(selected.config,google),null,2)+'\n',{flag:'wx'});
 return {directory:dir,planPath};
}
function revalidate(file){
 validatedSources();check(path.isAbsolute(file)&&path.basename(file)==='contract.json','staging_native_contract_invalid');
 const dir=path.dirname(file);check(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('spartang-v25-staging-')&&!fs.lstatSync(dir).isSymbolicLink(),'staging_native_contract_path_invalid');
 const plan=JSON.parse(fs.readFileSync(file));check(plan.profile===contract.PROFILE&&plan.projectId===contract.PROJECT&&plan.applicationId===contract.PACKAGE&&plan.versionCode===25&&plan.submissionEnabled===false&&plan.notificationSendingEnabled===false&&plan.namespace==='com.spartang.mobile','staging_native_contract_invalid');
 check(plan.sourceRoot===root&&plan.sourceValidation===path.join(root,'docs/assessment-submission-v25/android-staging-profile-20261031/VALIDATED_SOURCE.json'),'staging_source_binding_invalid');
 check(plan.manifest===path.join(dir,'AndroidManifest.xml')&&plan.googleServices===path.join(dir,'google-services.json')&&plan.appBuildDirectory===path.join(mobile,'android/app',path.basename(dir)),'staging_native_contract_path_invalid');
 check(plan.sourceValidationSha256===sha(fs.readFileSync(path.join(root,'docs/assessment-submission-v25/android-staging-profile-20261031/VALIDATED_SOURCE.json'))),'staging_source_validation_changed');
 check(sha(fs.readFileSync(plan.manifest))===plan.manifestSha256&&sha(fs.readFileSync(plan.googleServices))===plan.googleServicesSha256,'staging_native_input_changed');
 const selected=readGoogleServices(plan.googleServices),env=JSON.parse(fs.readFileSync(path.join(path.dirname(file),'environment.json'))),config=assertEnvironment(env);
 check(plan.androidAppId===selected.config.appId,'staging_native_app_binding_invalid');
 check(Object.keys(config).every(k=>config[k]===selected.config[k]),'staging_public_and_native_configuration_mismatch');
 check(env.GOOGLE_SERVICES_JSON===plan.googleServices&&env.SPARTAN_STAGING_GOOGLE_SERVICES===plan.googleServices,'staging_native_path_mismatch');
 check(fs.readFileSync(plan.manifest,'utf8')===stagingManifest(fs.readFileSync(path.join(mobile,'android/app/src/main/AndroidManifest.xml'),'utf8')),'staging_manifest_not_canonical');
 return true;
}
module.exports={...contract,root,mobile,defaultGoogleServices,rejectSensitive,assertSafeSource,readGoogleServices,environment,assertEnvironment,expoOverrides,stagingManifest,validatedSources,prepare,revalidate};
if(require.main===module){try{const [mode,file,...extra]=process.argv.slice(2);check(!extra.length&&['--validate','--prepare-approved-build','--revalidate-prepared-build'].includes(mode),'staging_command_invalid');
 if(mode==='--validate'){readGoogleServices(file||defaultGoogleServices());console.log(JSON.stringify({status:'configuration-valid',projectId:contract.PROJECT,applicationId:contract.PACKAGE,submissionEnabled:false,credentialsRead:false}));}
 else if(mode==='--revalidate-prepared-build'){revalidate(file);console.log(JSON.stringify({status:'prepared-inputs-valid'}));}
 else console.log(JSON.stringify(prepare(file||defaultGoogleServices())));
}catch(e){console.log(JSON.stringify({status:'stopped',stopCode:/^[a-z0-9_]+$/.test(e.message)?e.message:'local_staging_validation_failure',cloudRequests:0,apkBuilt:false}));process.exitCode=1;}}
