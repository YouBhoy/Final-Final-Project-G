/** Separate explicit Node entry. No automatic imports/exports from notification or mobile entries. */
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createSafetyControlledGardenRuntime } from './garden-production/safety';
import { assertProductionGardenDatabase, GARDEN_PRODUCTION_PROJECT } from './garden-production/runtime';
import { assertLocalRewardDatabase } from './garden-rewards/local-safety';
import { LOCAL_REWARD_PROJECT } from './garden-rewards/contracts';
import { createTokenVerifier } from './external-garden/auth';
import { createGardenHttpService } from './external-garden/service';
import { createGardenServer } from './external-garden/server';

export function externalConfiguration(environment: NodeJS.ProcessEnv) {
  const mode = environment.GARDEN_HTTP_MODE;
  const local = mode === 'local';
  if (!local && mode !== 'hosted') throw Error('Explicit local/hosted mode required');
  const projectId = environment.GCLOUD_PROJECT;
  if (projectId !== (local ? LOCAL_REWARD_PROJECT : GARDEN_PRODUCTION_PROJECT)) throw Error('Unexpected project');
  if (local) {
    if (!/^127\.0\.0\.1:\d+$/.test(environment.FIRESTORE_EMULATOR_HOST ?? '')
        || !/^127\.0\.0\.1:\d+$/.test(environment.FIREBASE_AUTH_EMULATOR_HOST ?? '')) throw Error('Both local emulators required');
  } else {
    if (environment.GARDEN_HTTP_HOSTED_ACK !== `${GARDEN_PRODUCTION_PROJECT}/(default)`
        || !environment.GOOGLE_APPLICATION_CREDENTIALS || !isAbsolute(environment.GOOGLE_APPLICATION_CREDENTIALS)
        || ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FUNCTIONS_EMULATOR','FIREBASE_DEBUG_FEATURES',
          'FIREBASE_DATABASE_EMULATOR_HOST'].some(name => !!environment[name])) throw Error('Hosted prerequisites not explicitly supplied');
  }
  const port = Number(environment.PORT ?? 18090);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('Invalid port');
  return {local,projectId,port,host:local?'127.0.0.1':'0.0.0.0'};
}

export async function startExternalGarden() {
  const config = externalConfiguration(process.env); // Validate before SDK initialization/discovery.
  if(config.local)await Promise.all([
    fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/`,{redirect:'error',signal:AbortSignal.timeout(3000)})
      .then(response=>{if(response.status>=500)throw Error('Firestore emulator unavailable');}),
    fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${config.projectId}/config`,{redirect:'error',signal:AbortSignal.timeout(3000)})
      .then(response=>{if(!response.ok)throw Error('Auth emulator unavailable');}),
  ]);
  const app = initializeApp(config.local ? {projectId:config.projectId} : {
    projectId:config.projectId, credential:cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS!,'utf8'))),
  }, 'external-garden-http');
  const db = getFirestore(app);
  try {
  const assertDatabase = config.local ? assertLocalRewardDatabase : assertProductionGardenDatabase;
  const runtime = createSafetyControlledGardenRuntime(assertDatabase);
  const api = createGardenServer(createGardenHttpService(db,runtime),createTokenVerifier(getAuth(app),config.projectId,true));
  // No fixture/control initialization. Bound readiness and terminate the SDK on failure.
  let readinessTimer: ReturnType<typeof setTimeout> | undefined;
  try {await Promise.race([db.doc('garden_rollout/config_v1').get(),new Promise<never>((_resolve,reject)=>{
    readinessTimer=setTimeout(()=>reject(Error('Database readiness timeout')),5000);
  })]);}finally{if(readinessTimer)clearTimeout(readinessTimer);}
  await new Promise<void>((resolve,reject) => {api.server.once('error',reject);api.server.listen(config.port,config.host,resolve);});
  let stopping = false;
  const stop = async () => {if(stopping)return;stopping=true;await api.close();await db.terminate();await deleteApp(app);};
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void stop().catch(()=>{process.exitCode=1;});});
  console.info('Garden HTTP server started; activation remains server-controlled.');
  return { ...api,stop };
  }catch{await db.terminate();await deleteApp(app);throw Error('Garden HTTP startup failed');}
}
if(require.main===module)void startExternalGarden().catch(()=>{console.error('Garden HTTP startup failed. Check approved server configuration.');process.exitCode=1;});
