// Existing cached tools only. Dedicated synthetic Auth/Firestore, no Functions/Android/cloud.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),net=require('node:net'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase8a');
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const runtime=path.join(os.tmpdir(),'spartan-g-garden-phase8a-'+stamp),project='demo-spartan-g-garden-phase2';
const tooling=path.join(os.tmpdir(),'spartan-g-local-firebase-tools-15.34.0');
const cli=path.join(tooling,'node_modules/firebase-tools/lib/bin/firebase.js'),cache=path.join(tooling,'emulator-cache');
const jar=path.join(cache,'cloud-firestore-emulator-v1.22.0.jar');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const delay=ms=>new Promise(r=>setTimeout(r,ms));let child,fd;const results=[];
const env={...process.env,GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,FIREBASE_CONFIG:JSON.stringify({projectId:project}),
 FIRESTORE_EMULATOR_HOST:'127.0.0.1:18088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:19097',GOOGLE_APPLICATION_CREDENTIALS:'',
 FIREBASE_TOKEN:'',CLOUDSDK_AUTH_ACCESS_TOKEN:'',GOOGLE_OAUTH_ACCESS_TOKEN:'',GCE_METADATA_HOST:'127.0.0.1:1',
 XDG_CONFIG_HOME:path.join(runtime,'profile'),APPDATA:path.join(runtime,'profile'),FIREBASE_EMULATORS_PATH:cache,CI:'1',FIREBASE_CLI_DISABLE_MOTD:'true',
 JAVA_HOME:'C:\\Program Files\\Android\\Android Studio\\jbr',JAVA_TOOL_OPTIONS:'-Xmx512m',
 PATH:`${path.dirname(process.execPath)};C:\\Program Files\\Android\\Android Studio\\jbr\\bin;${process.env.PATH}`};
async function command(args,name){const log=path.join(docs,`${name}-${stamp}.log`),out=fs.openSync(log,'wx');let code;
 try{code=await new Promise((resolve,reject)=>{const proc=cp.spawn(process.execPath,args,{cwd:root,env,windowsHide:true,stdio:['ignore',out,out]});proc.once('error',reject);proc.once('exit',resolve);});}finally{fs.closeSync(out);}
 const summary=fs.readFileSync(log,'utf8').split('\n').filter(l=>/^# (tests|pass|fail|skipped) /.test(l));results.push({name,code,log:path.basename(log),summary});console.log(`${name}: ${code===0?'PASS':'FAIL'} ${summary.join('; ')}`);if(code!==0)throw Error(`${name} failed`);}
(async()=>{
 if(process.versions.node!=='22.23.3'||!fs.existsSync(cli)||!fs.existsSync(jar)||hash(jar)!=='9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c'
  ||hash(path.join(root,'docs/sdk53-firestore-restoration/candidate.rules'))!=='4ec0f3c9bb399b9489c1d6ebf18f176ec81b9de3fbd20c3dee4fc5f370b7a5b1')throw Error('Approved cached tooling/candidate required; nothing will be installed');
 if(JSON.parse(fs.readFileSync(path.join(tooling,'node_modules/firebase-tools/package.json'))).version!=='15.34.0')throw Error('Pinned CLI required');
 for(const port of [19097,18088,19151,19441,19451,18090,10000,10001,10002])await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error(`Port ${port} occupied; no existing process stopped`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
 if(!process.argv.includes('--native-only')&&!process.argv.includes('--resume-http')&&!process.argv.includes('--hosting-only')){
  await command(['functions/node_modules/typescript/bin/tsc','-p','functions/tsconfig.json'],'external-build');
  await command(['functions/node_modules/typescript/bin/tsc','-p','functions/tsconfig.external-garden.json'],'external-typecheck');
 }else if(!fs.existsSync(path.join(root,'functions/lib/external-garden/server.js')))throw Error('Existing backend build required; no implicit rebuild');
 fs.mkdirSync(path.join(runtime,'profile'),{recursive:true});fs.copyFileSync(path.join(__dirname,'firebase.json'),path.join(runtime,'firebase.json'));fs.copyFileSync(path.join(root,'docs/sdk53-firestore-restoration/candidate.rules'),path.join(runtime,'candidate.rules'));
 fd=fs.openSync(path.join(docs,`http-emulators-${stamp}.log`),'wx');child=cp.spawn(process.execPath,[cli,'emulators:start','--project',project,'--config',path.join(runtime,'firebase.json'),'--only','auth,firestore','--non-interactive'],{cwd:runtime,env,windowsHide:true,stdio:['ignore',fd,fd]});
 let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Owned emulators exited');try{const [a,f]=await Promise.all([fetch(`http://127.0.0.1:19097/emulator/v1/projects/${project}/config`,{signal:AbortSignal.timeout(500)}),fetch('http://127.0.0.1:18088/',{signal:AbortSignal.timeout(500)})]);if(a.ok&&f.status<500){ready=true;break;}}catch{}await delay(500);}if(!ready)throw Error('Isolated emulator readiness failed');
 if(process.argv.includes('--native-only'))await command(['--test','--test-reporter=tap','--test-concurrency=1','tools/garden-phase8a/native-emulators.test.cjs'],'native-emulator-tests');
 else {
  if(!process.argv.includes('--hosting-only')){
   const args=['--test','--test-reporter=tap','--test-concurrency=1'];
   if(process.argv.includes('--resume-http')){
    const interrupted=JSON.parse(fs.readFileSync(path.join(docs,'http-run-20261017T072500Z.json'),'utf8'));
    const source=fs.readFileSync(path.join(docs,interrupted.partial.log));
    if(interrupted.interrupted!==true||interrupted.partial.completedNames.length!==45||crypto.createHash('sha256').update(source).digest('hex')!==interrupted.partial.sha256)throw Error('Interrupted evidence drift');
    // A negative lookahead also matches the parent file name, which makes Node
    // select every child. Use a positive list that cannot select the parent.
    const reference=fs.readFileSync(path.join(root,'docs/garden-phase7d/external-http-tests-20261016T213851Z.log'),'utf8');
    const all=[...reference.matchAll(/^ok \d+ - (.+)$/gm)].map(m=>m[1].trim()),remaining=all.filter(n=>!interrupted.partial.completedNames.includes(n));
    if(all.length!==63||remaining.length!==18)throw Error('Resume name inventory changed');
    const escape=s=>Array.from(s).map(c=>'\\^$.*+?()[]{}|'.includes(c)?'\\'+c:c).join('');
    const pattern='^(?:'+remaining.map(escape).join('|')+')$',matcher=new RegExp(pattern);
    if(interrupted.partial.completedNames.some(n=>matcher.test(n))||!remaining.every(n=>matcher.test(n))||matcher.test('functions/tests/external-garden.test.cjs'))throw Error('Unsafe resume selection');
    args.push('--test-name-pattern',pattern);
   }
   args.push('functions/tests/external-garden.test.cjs');await command(args,process.argv.includes('--resume-http')?'external-http-remaining-tests':'external-http-tests');
  }
  const args=['-r',path.join(__dirname,'no-egress.cjs'),'--test','--test-reporter=tap','--test-concurrency=1'];
  if(process.argv.includes('--hosting-retry'))args.push('--test-name-pattern','^(healthy disabled|paused committed|daily watering|re-enrollment|structured real)');
  args.push('tools/garden-phase8a/hosting.test.cjs');await command(args,process.argv.includes('--hosting-retry')?'hosting-retry-tests':'hosting-process-tests');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{
 if(child&&child.exitCode===null){cp.spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});for(let i=0;i<40&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null)process.exitCode=1;}
 if(fd!==undefined)fs.closeSync(fd);
 fs.writeFileSync(path.join(docs,`http-run-${stamp}.json`),JSON.stringify({at:new Date().toISOString(),node:process.version,project,ports:{auth:19097,firestore:18088,http:18090},productionAccess:false,androidAccess:false,results,passed:!process.exitCode},null,2)+'\n',{flag:'wx'});
});
