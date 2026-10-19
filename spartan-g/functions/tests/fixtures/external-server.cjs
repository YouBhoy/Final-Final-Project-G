// Synthetic process-restart fixture only; never part of a production entry/package.
const assert=require('node:assert/strict');
assert.equal(process.env.GCLOUD_PROJECT,'demo-spartan-g-garden-phase2');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:18088');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:19097');
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const {createGardenServer}=require('../../lib/external-garden/server'),{createTokenVerifier}=require('../../lib/external-garden/auth');
const {createGardenHttpService}=require('../../lib/external-garden/service'),{GardenFinalizer}=require('../../lib/external-garden/finalizer');
const {createSafetyControlledGardenRuntime}=require('../../lib/garden-production/safety'),{assertLocalRewardDatabase}=require('../../lib/garden-rewards/local-safety');
const app=initializeApp({projectId:process.env.GCLOUD_PROJECT}),db=getFirestore(app),runtime=createSafetyControlledGardenRuntime(assertLocalRewardDatabase);
const service=createGardenHttpService(db,runtime,undefined,()=>{});
const execute=service.execute.bind(service);
if(process.argv.includes('--crash-after-submission'))service.execute=async(action,uid,body)=>{
 if(action!=='finalize')return execute(action,uid,body);
 await runtime.withAdmission(db,'assessment',uid,()=>new GardenFinalizer(db,runtime).submit(uid,body.attemptId));
 process.send?.({committed:true});process.exit(0);
};
const api=createGardenServer(service,createTokenVerifier(getAuth(app),process.env.GCLOUD_PROJECT,true,()=>{}));
api.server.listen(18090,'127.0.0.1',()=>process.send?.({ready:true}));
process.once('SIGTERM',()=>void api.close().then(()=>db.terminate()).then(()=>process.exit(0)));
