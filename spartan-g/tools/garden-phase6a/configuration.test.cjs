const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('../../apps/mobile/node_modules/typescript');
const { gardenResolution } = require('../../apps/mobile/garden-module-resolver.cjs');
const root = path.resolve(__dirname, '../..');
function load(relative, imports={}, globals={}) {
  const module={exports:{}};
  const source=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,console:{warn(){}},...globals,require:name=>{assert.ok(Object.hasOwn(imports,name),`Unexpected import ${name}`);return imports[name];}},{filename:relative});
  return module.exports;
}
const resolve=(relative,dev,flag,platform='android')=>gardenResolution({type:'sourceFile',filePath:path.join(root,relative)},{dev},platform,flag).filePath.replace(/\\/g,'/');
for(const dev of [true,false,undefined]) for(const flag of [undefined,'0','1']) test(`build graph selection uses Metro dev=${dev}, opt-in=${flag}`,()=>{
  if(dev===undefined&&flag==='1'){assert.throws(()=>resolve('apps/mobile/src/garden/GardenBackendBoundary.tsx',dev,flag),/recognized Android/);return;}
  const target=resolve('apps/mobile/src/garden/GardenBackendBoundary.tsx',dev,flag);
  assert.equal(target.endsWith('.local.tsx'),dev===true&&flag==='1');
  const config=resolve('packages/shared-services/src/config/local-emulators.native.ts',dev,flag);
  assert.equal(config.endsWith('local-emulators.disabled.ts'),!(dev===true&&flag==='1'));
});
test('normal/release graph rejects direct imports of fixture UI, local registries and contracts',()=>{
  for(const relative of ['apps/mobile/src/development/LocalFirebaseBoundary.tsx','apps/mobile/src/development/LocalGardenChecks.tsx',
    'packages/shared-services/src/config/local-emulator-contract.ts','packages/shared-services/src/services/local-garden-operations.ts']) assert.throws(()=>resolve(relative,false,'1'),/excluded/);
  assert.ok(resolve('packages/shared-services/src/config/env.native.ts',false,'1').endsWith('env.normal.native.ts'));
  assert.ok(resolve('packages/shared-services/src/firebase/local-emulator-state.ts',false,'1').endsWith('local-emulator-state.disabled.ts'));
});
test('iOS and unrecognized resolver contexts never select Android emulator mode',()=>{
  assert.throws(()=>resolve('apps/mobile/src/garden/GardenBackendBoundary.tsx',true,'1','ios'),/recognized Android/);
  assert.throws(()=>resolve('apps/mobile/src/garden/GardenBackendBoundary.tsx',true,'yes'),/Unsupported/);
  const safe=load('packages/shared-services/src/config/local-emulators.disabled.ts');assert.equal(safe.localEmulators.enabled,false);
  const readiness=load('packages/shared-services/src/firebase/local-emulator-state.disabled.ts');assert.throws(()=>readiness.setLocalEmulatorsReady(true));
});
const configuration={EXPO_PUBLIC_FIREBASE_API_KEY:'synthetic',EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:'expected.invalid',EXPO_PUBLIC_FIREBASE_PROJECT_ID:'expected',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET:'expected.invalid',EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:'synthetic',EXPO_PUBLIC_FIREBASE_APP_ID:'synthetic'};
// Preserve generic native/iOS parity fixtures; Android registration is tested separately.
const nativeRegistrationImports={'react-native':{Platform:{OS:'ios'}},'./firebase-app-id':load('packages/shared-services/src/config/firebase-app-id.ts')};
for(const appEnv of [undefined,'development','staging','production','unsupported']) test(`normal Firebase configuration is identical for appEnv=${appEnv}`,()=>{
  const env={...configuration,...(appEnv?{EXPO_PUBLIC_APP_ENV:appEnv}:{})};
  const imports={...nativeRegistrationImports,'./env.shared':{resolveDeploymentTarget(){}},'./local-emulators':{localEmulators:{enabled:false}}};
  const original=load('packages/shared-services/src/config/env.native.ts',imports,{process:{env}}).env;
  const separated=load('packages/shared-services/src/config/env.normal.native.ts',imports,{process:{env}}).env;
  assert.equal(JSON.stringify(original),JSON.stringify(separated));
});
test('VITE fallback, public precedence, optional EAS and missing-field validation remain equivalent',()=>{
  const env=Object.fromEntries(Object.entries(configuration).map(([k,v])=>[k.replace('EXPO_PUBLIC_','VITE_'),v]));
  env.EXPO_PUBLIC_FIREBASE_PROJECT_ID='preferred';env.EXPO_PUBLIC_EAS_PROJECT_ID='synthetic-eas';
  const imports={...nativeRegistrationImports,'./env.shared':{resolveDeploymentTarget(){}},'./local-emulators':{localEmulators:{enabled:false}}};
  assert.equal(JSON.stringify(load('packages/shared-services/src/config/env.native.ts',imports,{process:{env}}).env),JSON.stringify(load('packages/shared-services/src/config/env.normal.native.ts',imports,{process:{env}}).env));
  delete env.VITE_FIREBASE_APP_ID;for(const file of ['env.native.ts','env.normal.native.ts']) assert.throws(()=>load('packages/shared-services/src/config/'+file,imports,{process:{env}}),/Missing required Firebase configuration: appId/);
});
test('production routing defaults off and rejects unsupported settings',()=>{
  const result=load('packages/shared-services/src/config/garden-backend.ts',{}, {process:{env:{}}});assert.equal(result.productionGardenEnabled,false);
  assert.equal(result.trustedGardenOptIn('1'),true);assert.throws(()=>result.trustedGardenOptIn('yes'));
  const module=load('packages/shared-services/src/services/garden-backend.ts',{'../config/garden-backend':{productionGardenEnabled:false}});
  assert.equal(module.isGardenBackendEnabled(),false);assert.throws(()=>module.installGardenOperations({}));assert.throws(()=>module.getGardenOperations());
});
function adapter({enabled=true,project='spartan-g-a2d80',emulatorOrigin=null,authEmulator=null}={}) {
  let installed,dependencies,calls=0,lookups=0;
  const app={options:{projectId:project}},auth={app,currentUser:{uid:'synthetic-student'},emulatorConfig:authEmulator};
  const functions={app,emulatorOrigin};
  const imports={
    'expo-file-system':{documentDirectory:'synthetic://files/'},'expo-modules-core':{uuid:{v4:()=> '00000000-0000-4000-8000-000000000001'}},
    'firebase/functions':{getFunctions:(value,region)=>{lookups++;assert.equal(value,app);assert.equal(region,'asia-southeast1');return functions;},httpsCallable:(value,name)=>async data=>{assert.equal(value,functions);calls++;return {data:{name,input:data}};}},
    '@spartan-g/shared-services/src/config/env':{env:{firebase:{projectId:project}}},
    '@spartan-g/shared-services/src/config/garden-backend':{GARDEN_PRODUCTION_PROJECT:'spartan-g-a2d80',GARDEN_PRODUCTION_REGION:'asia-southeast1',productionGardenEnabled:enabled},
    '@spartan-g/shared-services/src/firebase/app':{getFirebaseApp:()=>app},'@spartan-g/shared-services/src/firebase/auth':{getFirebaseAuth:()=>auth},
    '@spartan-g/shared-services/src/services/garden-operations.client':{GardenOperationsClient:class{constructor(value){dependencies=value;}},validatePendingOperations:value=>value},
    '@spartan-g/shared-services/src/services/garden-backend':{installGardenOperations:value=>installed=value},
  };
  const module=load('apps/mobile/src/garden/productionGardenBackend.ts',imports);
  return {module,auth,functions,dependencies:()=>dependencies,installed:()=>installed,calls:()=>calls,lookups:()=>lookups};
}
test('disabled adapter performs no Firebase lookup and enabled preparation performs no request',()=>{
  const off=adapter({enabled:false});off.module.installProductionGardenBackend();assert.equal(off.installed(),undefined);assert.equal(off.lookups(),0);
  const on=adapter();on.module.installProductionGardenBackend();assert.ok(on.installed());assert.equal(on.lookups(),0);assert.equal(on.calls(),0);
});
test('production callable transport uses the same authenticated app, approved region and identity-only body',async()=>{
  const h=adapter();h.module.installProductionGardenBackend();assert.equal(h.dependencies().currentUid(),'synthetic-student');
  const data={requestId:'00000000-0000-4000-8000-000000000001'};const reply=await h.dependencies().invoke('waterGarden',data);
  assert.equal(reply.name,'waterGarden');assert.equal(reply.input,data);assert.equal(h.calls(),1);
});
test('wrong project and Auth/Functions emulator origins fail closed with no callable request',async()=>{
  const wrong=adapter({project:'wrong'});assert.throws(()=>wrong.module.installProductionGardenBackend(),/project mismatch/);assert.equal(wrong.calls(),0);
  for(const options of [{emulatorOrigin:'http://synthetic.invalid'},{authEmulator:{host:'synthetic.invalid'}},{emulatorOrigin:undefined}]){
    const h=adapter(options);if(Object.hasOwn(options,'emulatorOrigin')&&options.emulatorOrigin===undefined) delete h.functions.emulatorOrigin;
    h.module.installProductionGardenBackend();await assert.rejects(()=>h.dependencies().invoke('waterGarden',{requestId:'synthetic'}),/routing mismatch/);assert.equal(h.calls(),0);
  }
});
test('normal development keeps the legacy path while the new local bridge reuses the unchanged local client',()=>{
  const local={};const module=load('packages/shared-services/src/services/garden-backend.local.ts',{'../config/local-emulators':{localEmulators:{enabled:true}},'./local-garden-operations':{getLocalGardenOperations:()=>local}});
  assert.equal(module.isGardenBackendEnabled(),true);assert.equal(module.getGardenOperations(),local);
});
