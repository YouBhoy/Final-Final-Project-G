// Inspect real registration metadata; mock Admin creation so no production SDK/database is initialized.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),backend=createRequire(path.join(root,'functions/package.json'));
test('prepared entry exports exactly three generation-2 handlers without any database operation',()=>{
 const module={exports:{}};let reads=0,assertions=0;
 const db={doc(){reads++;throw Error('Database access prohibited during registration');},runTransaction(){reads++;throw Error('Database access prohibited during registration');}};
 const runtime={assertDatabase(value){assert.equal(value,db);assertions++;},activation(){throw Error('No activation during registration');}};
 const imports={
  'firebase-admin/app':{initializeApp:(options,name)=>{assert.equal(options.projectId,'spartan-g-a2d80');assert.equal(name,'spartan-g-garden-server');return 'mock-app';}},
  'firebase-admin/firestore':{getFirestore:(app,database)=>{assert.equal(app,'mock-app');assert.equal(database,'(default)');return db;}},
  './garden-production/runtime':{GARDEN_PRODUCTION_PROJECT:'spartan-g-a2d80',productionGardenRuntime:runtime},
  './garden-production/functions':backend('./lib/garden-production/functions'),
 };
 vm.runInNewContext(fs.readFileSync(path.join(root,'functions/lib/production-garden.js'),'utf8'),{module,exports:module.exports,require:name=>{assert.ok(Object.hasOwn(imports,name));return imports[name];}});
 assert.deepEqual(Object.keys(module.exports).sort(),['assessmentSubmitted','recoverAssessmentReward','waterGarden']);assert.equal(reads,0);assert.ok(assertions>=3);
 for(const value of Object.values(module.exports)){assert.equal(value.__endpoint.platform,'gcfv2');assert.deepEqual(value.__endpoint.region,['asia-southeast1']);assert.equal(value.__endpoint.maxInstances,5);}
 assert.ok(module.exports.assessmentSubmitted.__endpoint.eventTrigger);assert.ok(module.exports.waterGarden.__endpoint.callableTrigger);assert.ok(module.exports.recoverAssessmentReward.__endpoint.callableTrigger);
});
test('staged review source isolates Garden main from notifications and local entry points',()=>{
 const docs=path.join(root,'docs/garden-phase6a'),file=fs.readdirSync(docs).filter(n=>/^production-stage-.*\.json$/.test(n)).sort().at(-1);assert.ok(file);
 const record=JSON.parse(fs.readFileSync(path.join(docs,file),'utf8'));assert.equal(record.cliInvoked,false);assert.equal(record.activationControlsCreated,false);
 const pkg=JSON.parse(fs.readFileSync(path.join(record.target,'functions/package.json'),'utf8'));assert.equal(pkg.main,'lib/production-garden.js');assert.equal(pkg.engines.node,'22');assert.deepEqual(pkg.scripts,{});
 assert.equal(record.notificationEntryIncluded,false);assert.equal(record.emulatorEntryIncluded,false);
 const original=JSON.parse(fs.readFileSync(path.join(root,'functions/package.json'),'utf8'));assert.deepEqual(pkg.dependencies,original.dependencies);
 assert.ok(!record.files.some(f=>/local-garden|local-functions\./.test(f.path)));
});
