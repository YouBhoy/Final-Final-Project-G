'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto'),{createRequire}=require('node:module'),{spawnSync}=require('node:child_process');
const stage=path.resolve(__dirname,'../../../apps/mobile/staging'),p=require(path.join(stage,'profile.cjs')),offline=path.resolve(__dirname,'../hosted-bootstrap-inspection-20261031/offline.cjs');
const publicOptions=()=>({apiKey:'AIza'+'0'.repeat(35),authDomain:p.PROJECT+'.firebaseapp.com',projectId:p.PROJECT,storageBucket:p.PROJECT+'.firebasestorage.app',messagingSenderId:p.PROJECT_NUMBER,appId:'1:'+p.PROJECT_NUMBER+':android:'+'0'.repeat(20)});
if(process.argv[2]==='--probe'){
 const paths=require(require.resolve('@expo/config/paths',{paths:[p.mobile]}));
 const server=paths.getMetroServerRoot(p.mobile),entry=paths.resolveEntryPoint(p.mobile,{platform:'android'});
 const result={serverMatchesMobile:server===p.mobile,serverMatchesWorkspace:server===p.root,relativeEntryExists:fs.existsSync(path.resolve(server,'index.ts')),resolvedEntryMatchesMobileIndex:entry===path.join(p.mobile,'index.ts')};
 if(process.argv[3]==='corrected'){
  const config=require(path.join(p.mobile,'metro.config.js'));
  const {getConfig}=require(require.resolve('@expo/config',{paths:[p.mobile]})),expo=getConfig(p.mobile,{skipSDKVersionRequirement:true}).exp;
  Object.assign(result,{metroProjectRootMatchesMobile:config.projectRoot===p.mobile,metroServerRootMatchesMobile:config.server.unstable_serverRoot===p.mobile,
   sharedPackagesVisible:config.watchFolders.includes(path.join(p.root,'packages')),hoistedDependenciesVisible:config.watchFolders.includes(path.join(p.root,'node_modules')),
   applicationId:expo.android.package,versionCode:expo.android.versionCode,firebaseProject:expo.extra.firebaseProject,submissionEnabled:expo.extra.assessmentSubmissionEnabled,productionUpdateBinding:!!expo.extra.eas,
   packageMain:JSON.parse(fs.readFileSync(path.join(p.mobile,'package.json'))).main,networkAttempts:global.__packagedNetworkAttempts});
 }
 console.log(JSON.stringify(result));
}else{
 const {test}=require('node:test'),assert=require('node:assert/strict');
 function probe(corrected){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-entry-root-')),file=path.join(dir,'google-services.json'),v=publicOptions();
  fs.writeFileSync(file,JSON.stringify({project_info:{project_id:p.PROJECT,project_number:p.PROJECT_NUMBER,storage_bucket:v.storageBucket},client:[{client_info:{android_client_info:{package_name:p.PACKAGE},mobilesdk_app_id:v.appId},api_key:[{current_key:v.apiKey}]}],configuration_version:'1'}));
  const env=p.environment(v,file);if(!corrected)delete env.EXPO_NO_METRO_WORKSPACE_ROOT;
  const result=spawnSync(process.execPath,['--require',offline,__filename,'--probe',corrected?'corrected':'original'],{cwd:p.mobile,env,encoding:'utf8',windowsHide:true,timeout:60000});
  assert.equal(result.status,0,'Offline installed-Expo probe failed');return JSON.parse(result.stdout);
 }
 const original=probe(false),corrected=probe(true);
 test('reproduces original failure with installed Expo: workspace server root and missing relative entry',()=>{assert.equal(original.serverMatchesWorkspace,true);assert.equal(original.serverMatchesMobile,false);assert.equal(original.relativeEntryExists,false);assert.equal(original.resolvedEntryMatchesMobileIndex,true);});
 test('corrected installed Expo resolves the Windows relative entry against the mobile root',()=>{assert.equal(corrected.serverMatchesMobile,true);assert.equal(corrected.serverMatchesWorkspace,false);assert.equal(corrected.relativeEntryExists,true);assert.equal(corrected.resolvedEntryMatchesMobileIndex,true);});
 test('actual staging Metro configuration uses the same project and server root',()=>{assert.equal(corrected.metroProjectRootMatchesMobile,true);assert.equal(corrected.metroServerRootMatchesMobile,true);});
 test('actual staging Metro retains shared-package and hoisted-dependency visibility',()=>{assert.equal(corrected.sharedPackagesVisible,true);assert.equal(corrected.hoistedDependenciesVisible,true);});
 test('entry and actual Expo configuration retain staging package, version, project and disabled submission',()=>{assert.equal(corrected.packageMain,'index.ts');assert.equal(corrected.applicationId,p.PACKAGE);assert.equal(corrected.versionCode,25);assert.equal(corrected.firebaseProject,p.PROJECT);assert.equal(corrected.submissionEnabled,false);assert.equal(corrected.productionUpdateBinding,false);assert.equal(corrected.networkAttempts,0);});
 test('fresh staging environment sets the supported Expo switch without inheriting contrary values',()=>{const env=p.environment(publicOptions(),'/synthetic/google-services.json',{EXPO_NO_METRO_WORKSPACE_ROOT:'0',ENTRY_FILE:'wrong.ts'});assert.equal(env.EXPO_NO_METRO_WORKSPACE_ROOT,'1');assert.equal(env.ENTRY_FILE,'index.ts');p.assertEnvironment(env);});
 for(const value of [undefined,'0','false',true])test('missing or invalid Metro root switch fails closed: '+String(value),()=>{const env=p.environment(publicOptions(),'/synthetic/google-services.json');env.EXPO_NO_METRO_WORKSPACE_ROOT=value;assert.throws(()=>p.assertEnvironment(env),/staging_entry_root_invalid/);assert.throws(()=>p.assertEnvironment(env,true),/staging_entry_root_invalid/);});
 for(const value of [undefined,'../index.ts','apps/mobile/index.ts','expo-router/entry','C:\\synthetic\\index.ts'])test('unexpected staging entry fails closed: '+String(value),()=>{const env=p.environment(publicOptions(),'/synthetic/google-services.json');env.ENTRY_FILE=value;assert.throws(()=>p.assertEnvironment(env),/staging_entry_root_invalid/);});
 test('native staging init script enforces the same root switch and relative entry',()=>{const source=fs.readFileSync(path.join(stage,'native.gradle'),'utf8');assert.match(source,/System\.getenv\('EXPO_NO_METRO_WORKSPACE_ROOT'\)!='1'\|\|System\.getenv\('ENTRY_FILE'\)!='index\.ts'/);});
 test('existing startup registration and React Navigation remain unchanged',()=>{const entry=fs.readFileSync(path.join(p.mobile,'index.ts'),'utf8'),app=fs.readFileSync(path.join(p.mobile,'src/app/App.tsx'),'utf8');assert.match(entry,/registerRootComponent\(App\)/);assert.match(entry,/\.\/src\/app\/App/);assert.match(app,/<AppSecurityBoundary><RootNavigator \/><\/AppSecurityBoundary>/);assert.doesNotMatch(entry,/expo-router/);});
 test('new Metro branch leaves normal production configuration and resolver behavior unchanged',()=>{
  const file=path.join(p.mobile,'metro.config.js'),text=fs.readFileSync(file,'utf8');
  const block=/if \(androidProfile === 'staging-v25'\) \{\r?\n  \/\/ Expo's mobile server root[\s\S]*?\r?\n\}\r?\n/;
  const old=text.replace(block,''),baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'PRESERVATION_BEFORE.json'))).files.find(f=>f.path==='apps/mobile/metro.config.js');
  assert.equal(crypto.createHash('sha256').update(old).digest('hex'),baseline.sha256);
  const backup=path.join(__dirname,'metro.config.js.before');if(!fs.existsSync(backup))fs.writeFileSync(backup,old,{flag:'wx'});
  function load(code){const m={exports:{}},requireModule=n=>{
   if(n==='expo/metro-config')return{getDefaultConfig:()=>({resolver:{},watchFolders:['synthetic-baseline']})};
   if(n==='./garden-module-resolver.cjs')return{gardenResolution:x=>x};
   if(n==='./ai-module-resolver.cjs')return{aiResolution:x=>x,readAiMode:()=> 'disabled'};
   if(n==='./staging/resolver.cjs')return require(path.join(stage,'resolver.cjs'));
   throw Error('unexpected_module');
  };vm.runInNewContext(code,{module:m,exports:m.exports,require:requireModule,process:{env:{}},__dirname:p.mobile});return m.exports;}
  const before=load(old),after=load(text);assert.equal(JSON.stringify(before),JSON.stringify(after));const resolution={type:'sourceFile',filePath:path.join(p.root,'packages/shared-services/src/config/env.native.ts')},context={resolveRequest:()=>resolution};assert.equal(after.resolver.resolveRequest(context,'synthetic','android'),resolution);
 });
 test('local tests attempted zero network calls',()=>assert.equal(global.__packagedNetworkAttempts,0));
 test('Metro virtual source names resolve from the mobile server root',()=>{const {canonicalSource}=require('./validate-bundle.cjs');assert.equal(canonicalSource('/index.ts'),path.join(p.mobile,'index.ts'));assert.equal(canonicalSource('/src/app/App.tsx'),path.join(p.mobile,'src/app/App.tsx'));assert.equal(canonicalSource('/../../packages/shared-services/src/firebase/app.ts'),path.join(p.root,'packages/shared-services/src/firebase/app.ts'));});
 test('real Windows drive-qualified source names retain their identity',()=>{const {canonicalSource}=require('./validate-bundle.cjs');assert.equal(canonicalSource(path.join(p.mobile,'index.ts')),path.join(p.mobile,'index.ts'));});
}
