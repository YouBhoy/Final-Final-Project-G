'use strict';
// Local production-connected presentation preparation. No network or signing I/O.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),mobile=path.dirname(__dirname);
const PROFILE='production-presentation-v31',PROJECT='spartan-g-a2d80',PACKAGE='com.spartang.mobile',VERSION=31;
const report=path.join(root,'docs/android-presentation-preflight-20261102');
const validation=path.join(report,'VALIDATED_SOURCE.json'),digest=path.join(report,'VALIDATED_SOURCE.sha256');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const check=(value,code)=>{if(!value)throw Error(code);};
let graphInventory;
function mode(value){if(value===undefined||value==='')return false;check(value===PROFILE,'presentation_profile_invalid');return true;}
function parseEnv(file){const out={};for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match){check(!Object.hasOwn(out,match[1]),'duplicate_public_config_field');out[match[1]]=match[2].replace(/^['"]|['"]$/g,'');}}return out;}
function publicConfiguration(){
 const googleFiles=['google-services.json','android/app/google-services.json'].map(p=>path.join(mobile,p));
 const google=googleFiles.map(p=>JSON.parse(fs.readFileSync(p,'utf8')));
 for(const value of google){check(value.project_info.project_id===PROJECT&&value.client.length===1,'production_google_project_mismatch');check(value.client[0].client_info.android_client_info.package_name===PACKAGE,'production_google_package_mismatch');}
 check(JSON.stringify(google[0])===JSON.stringify(google[1]),'production_google_files_differ');
 const info=google[0].project_info,client=google[0].client[0],env=parseEnv(path.join(mobile,'.env')),web=parseEnv(path.join(root,'apps/web/.env'));
 // Preserve the existing JS Auth key (and its persistence namespace). Native
 // Google Services has a separate existing public key; key equality is not a
 // Firebase project/registration requirement and is not silently imposed here.
 const values={projectId:info.project_id,authDomain:env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,storageBucket:info.storage_bucket,messagingSenderId:info.project_number,appId:client.client_info.mobilesdk_app_id,apiKey:env.EXPO_PUBLIC_FIREBASE_API_KEY};
 check(values.authDomain===PROJECT+'.firebaseapp.com'&&values.storageBucket===PROJECT+'.firebasestorage.app','production_public_domain_mismatch');
 check(values.messagingSenderId==='250999113503'&&values.appId==='1:250999113503:android:e2cc2c39b6b16decacd22a','production_android_registration_mismatch');
 check(/^AIza[A-Za-z0-9_-]{35}$/.test(values.apiKey),'production_public_api_key_invalid');
 check(/^AIza[A-Za-z0-9_-]{35}$/.test(client.api_key[0].current_key),'production_native_public_api_key_invalid');
 for(const [field,name]of [['projectId','PROJECT_ID'],['authDomain','AUTH_DOMAIN'],['storageBucket','STORAGE_BUCKET'],['messagingSenderId','MESSAGING_SENDER_ID'],['apiKey','API_KEY']])check(env['EXPO_PUBLIC_FIREBASE_'+name]===values[field]&&web['VITE_FIREBASE_'+name]===values[field],'web_mobile_public_config_mismatch');
 check(env.EXPO_PUBLIC_FIREBASE_APP_ID===web.VITE_FIREBASE_APP_ID,'web_client_registration_mismatch');
 return{firebase:values,googleServices:googleFiles[1],webAppId:web.VITE_FIREBASE_APP_ID,easProject:env.EXPO_PUBLIC_EAS_PROJECT_ID};
}
function environment(base=process.env){
 const config=publicConfiguration(),safe={};for(const key of ['SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE']){const actual=Object.keys(base).find(name=>name.toLowerCase()===key.toLowerCase());if(actual&&base[actual])safe[key]=base[actual];}
 const node=path.join(os.tmpdir(),'spartan-g-phase5-node22.23.3/node-v22.23.3-win-x64'),java='C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.20.101-hotspot';
 Object.assign(safe,{PATH:[node,path.join(java,'bin'),path.join(base.SystemRoot||'C:\\Windows','System32')].join(path.delimiter),JAVA_HOME:java,ANDROID_HOME:path.join(os.homedir(),'AppData/Local/Android/Sdk'),CI:'1',EXPO_OFFLINE:'1',EXPO_NO_DOTENV:'1',EXPO_NO_METRO_WORKSPACE_ROOT:'1',NODE_ENV:'production',SPARTAN_ANDROID_PROFILE:'production',SPARTAN_PRESENTATION_PROFILE:PROFILE,EXPO_PUBLIC_APP_ENV:'production',EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE:'0',EXPO_PUBLIC_SPARTAN_GARDEN_BACKEND:'0',SPARTAN_AI_MODE:'disabled',EXPO_PUBLIC_ASSESSMENT_FINALIZER_ENABLED:'false',EXPO_PUBLIC_ASSESSMENT_FINALIZER_URL:'',EXPO_PUBLIC_GEMINI_API_KEY:'',EXPO_PUBLIC_GEMINI_ASSISTANT_API_KEY:'',EXPO_PUBLIC_EAS_PROJECT_ID:config.easProject,GOOGLE_SERVICES_JSON:config.googleServices,ENTRY_FILE:'index.ts'});
 for(const [field,name]of [['apiKey','API_KEY'],['authDomain','AUTH_DOMAIN'],['projectId','PROJECT_ID'],['storageBucket','STORAGE_BUCKET'],['messagingSenderId','MESSAGING_SENDER_ID'],['appId','APP_ID']])safe['EXPO_PUBLIC_FIREBASE_'+name]=config.firebase[field];
 return safe;
}
function assertEnvironment(env,runtime=false){
 const expected=environment();for(const [key,value]of Object.entries(expected))check(env[key]===value,'presentation_environment_mismatch');
 check(runtime||Object.keys(env).every(key=>Object.hasOwn(expected,key)||/^SPARTAN_RELEASE_(?:STORE_FILE|KEY_ALIAS|STORE_PASSWORD|KEY_PASSWORD)$/.test(key)||key==='SPARTAN_PRESENTATION_CONTRACT'),'presentation_unexpected_environment');
 check(!Object.keys(env).some(key=>/^VITE_|^SPARTAN_STAGING_|TOKEN|SERVICE_ACCOUNT|PRIVATE_KEY|NODE_OPTIONS/.test(key)),'presentation_ambient_credentials_rejected');
 return true;
}
function expoOverrides(base,env){assertEnvironment(env,true);return{...base,name:'SPARTAN-G PRIVATE v31',android:{...base.android,package:PACKAGE,versionCode:VERSION,googleServicesFile:publicConfiguration().googleServices}};}
function resolution(resolved,context,platform,selected){
 if(!mode(selected))return resolved;
 check(platform==='android'&&context.dev===false,'presentation_requires_android_release');
 const files=resolved.type==='sourceFile'?[resolved.filePath]:resolved.type==='assetFiles'?resolved.filePaths:[];
 for(const file of files){const relative=path.relative(root,file).replaceAll('\\','/');check(!/^apps\/mobile\/(?:staging|presentation)\//.test(relative)&&!/(?:^|\/)\.env(?:\.|$)|google-services\.json$|\.(?:jks|keystore|p12|pfx|pem|key)$|firebase-admin|@google-cloud\//i.test(relative),'presentation_unsafe_module');
  if (/^apps\/mobile\/(?:src|assets)\/|^packages\/[^/]+\/src\//.test(relative)) {
   if(!graphInventory){check(sha(fs.readFileSync(validation))===fs.readFileSync(digest,'utf8').trim(),'presentation_manifest_digest_mismatch');graphInventory=new Map(JSON.parse(fs.readFileSync(validation)).files.map(input=>[input.path,input.sha256]));}
   check(graphInventory.has(relative),'presentation_unreviewed_module');
   check(sha(fs.readFileSync(file))===graphInventory.get(relative),'presentation_resolved_source_changed');
  }
 }
 return resolved;
}
function validatedSources(){
 check(sha(fs.readFileSync(validation))===fs.readFileSync(digest,'utf8').trim(),'presentation_manifest_digest_mismatch');
 const state=JSON.parse(fs.readFileSync(validation));check(state.passed===true&&state.profile===PROFILE&&state.apkBuilt===false&&state.files.length>300,'presentation_manifest_invalid');
 check(cp.execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()==='app','android_app_branch_required');
 check(cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()===state.appHead,'presentation_app_head_changed');
 for(const file of state.files){const absolute=path.resolve(root,file.path);check(absolute.startsWith(root+path.sep),'presentation_source_outside_checkout');const data=fs.readFileSync(absolute);check(sha(data)===file.sha256,'presentation_source_changed');if(/\.(?:[cm]?js|tsx?|json|gradle|kt|xml|ps1)$/.test(file.path))check(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"type"\s*:\s*"service_account"/.test(data.toString('utf8')),'presentation_sensitive_source');}
 return state;
}
function prepare(){
 check(process.version==='v22.23.3','verified_node_required');validatedSources();const config=publicConfiguration(),env=environment();assertEnvironment(env);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'spartang-v31-presentation-'));
 const contract={profile:PROFILE,projectId:PROJECT,applicationId:PACKAGE,versionCode:VERSION,sourceRoot:root,sourceValidation:validation,sourceValidationSha256:sha(fs.readFileSync(validation)),googleServices:config.googleServices,googleServicesSha256:sha(fs.readFileSync(config.googleServices)),appBuildDirectory:path.join(mobile,'android/app',path.basename(directory)),submissionEnabled:false,presentationScreenshots:true,privateDistributionOnly:true};
 const planPath=path.join(directory,'contract.json');fs.writeFileSync(planPath,JSON.stringify(contract,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(directory,'environment.json'),JSON.stringify(env,null,2)+'\n',{flag:'wx'});return{directory,planPath};
}
function revalidate(file){
 validatedSources();check(path.isAbsolute(file)&&path.basename(file)==='contract.json','presentation_contract_invalid');
 const directory=path.dirname(file);check(path.dirname(directory)===os.tmpdir()&&path.basename(directory).startsWith('spartang-v31-presentation-')&&!fs.lstatSync(directory).isSymbolicLink(),'presentation_contract_path_invalid');
 const plan=JSON.parse(fs.readFileSync(file));check(plan.profile===PROFILE&&plan.projectId===PROJECT&&plan.applicationId===PACKAGE&&plan.versionCode===VERSION&&plan.submissionEnabled===false&&plan.presentationScreenshots===true&&plan.privateDistributionOnly===true,'presentation_contract_invalid');
 check(plan.sourceRoot===root&&plan.sourceValidation===validation&&plan.sourceValidationSha256===sha(fs.readFileSync(validation)),'presentation_source_binding_invalid');
 check(plan.googleServices===publicConfiguration().googleServices&&plan.googleServicesSha256===sha(fs.readFileSync(plan.googleServices)),'presentation_native_config_changed');
 check(plan.appBuildDirectory===path.join(mobile,'android/app',path.basename(directory))&&!fs.existsSync(plan.appBuildDirectory),'presentation_output_collision');
 assertEnvironment(JSON.parse(fs.readFileSync(path.join(directory,'environment.json'))));return true;
}
module.exports={root,mobile,PROFILE,PROJECT,PACKAGE,VERSION,mode,publicConfiguration,environment,assertEnvironment,expoOverrides,resolution,validatedSources,prepare,revalidate};
if(require.main===module)try{const option=process.argv[2];if(option==='--validate'){validatedSources();publicConfiguration();assertEnvironment(environment());console.log(JSON.stringify({status:'configuration-valid',profile:PROFILE,projectId:PROJECT,applicationId:PACKAGE,versionCode:VERSION,submissionEnabled:false,credentialsRead:false,apkBuilt:false}));}else if(option==='--prepare-approved-build')console.log(JSON.stringify(prepare()));else if(option==='--revalidate-prepared-build'){revalidate(process.argv[3]);console.log('{"status":"prepared-inputs-valid"}');}else throw Error('presentation_action_invalid');}catch(error){console.log(JSON.stringify({status:'stopped',stopCode:/^[a-z0-9_]+$/.test(error.message)?error.message:'presentation_validation_failure',apkBuilt:false}));process.exitCode=1;}
