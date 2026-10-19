// Host-only process orchestration. Stops only this runner's emulator children.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7c');
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const delay=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
let child,fd;
async function stop(){
 if(child&&child.exitCode===null){
  let ownsSidecar=false;
  try{const state=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'spartan-g-garden-phase6c/state.json'),'utf8'));
   ownsSidecar=state.parentPid===child.pid&&state.hostOnly===true&&state.projectId==='demo-spartan-g-garden-phase2';}catch{}
  if(ownsSidecar){try{await fetch('http://127.0.0.1:19098/stop',{method:'POST',signal:AbortSignal.timeout(5000)});}catch{}}
  else cp.spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});
  for(let i=0;i<60&&child.exitCode===null;i++)await delay(250);
  if(child.exitCode===null)throw Error('Owned host launcher did not finish cleanup; do not stop other processes');
 }
 child=undefined;if(fd!==undefined){fs.closeSync(fd);fd=undefined;}
}
function prepareTestFile(mode,file){
 // The original legacy suite writes a phase-specific timing artifact. Redirect
 // only that artifact path in a new source copy; never overwrite earlier evidence.
 let testFile=path.join(root,'tools/garden-phase6c',file);
 if(mode==='legacy'){
  const source=fs.readFileSync(testFile,'utf8'),from='../../docs/garden-phase6c/platform-health-timing.json';
  if(source.split(from).length!==2)throw Error('Legacy artifact location changed; review before running');
  testFile=path.join(docs,`routing-legacy-${stamp}.test.cjs`);
  fs.writeFileSync(testFile,source.replace(from,`../../docs/garden-phase7c/platform-health-timing-${stamp}.json`),{flag:'wx'});
 }
 return testFile;
}
async function suite(mode,file){
 const testFile=prepareTestFile(mode,file);
 fd=fs.openSync(path.join(docs,`launcher-${mode}-${stamp}.log`),'wx');
 child=cp.spawn(process.execPath,[path.join(root,'tools/garden-phase6c/start.cjs'),'--host-only',...(mode==='legacy'?[]:[mode==='controlled'?'--controlled':'--safety'])],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});
 let ready=false;
 for(let i=0;i<150;i++){
  if(child.exitCode!==null)throw Error(`${mode} launcher exited; inspect its local log`);
  try{const r=await fetch('http://127.0.0.1:19098/health',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}
  await delay(500);
 }
 if(!ready)throw Error(`${mode} host readiness timed out`);
 const log=path.join(docs,`platform-${mode}-${stamp}.tap`),out=fs.openSync(log,'wx');
 let code;try{code=await new Promise((resolve,reject)=>{const proc=cp.spawn(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',testFile],{cwd:root,windowsHide:true,stdio:['ignore',out,out]});proc.once('error',reject);proc.once('exit',resolve);});}finally{fs.closeSync(out);}
 const summary=fs.readFileSync(log,'utf8').split('\n').filter(line=>/^# (tests|pass|fail|skipped) /.test(line));
 results.push({mode,code,log:path.basename(log),summary});console.log(`${mode}: ${code===0?'PASS':'FAIL'} ${summary.join('; ')}`);
 await stop();if(code!==0)throw Error(`${mode} routing tests failed`);
}
(async()=>{
 if(process.argv.includes('--check-artifact-routing')){
  const assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
  const sourceFile=path.join(root,'tools/garden-phase6c/platform.test.cjs'),source=fs.readFileSync(sourceFile,'utf8');
  const originalTiming=path.join(root,'docs/garden-phase6c/platform-health-timing.json');
  const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const before=hash(originalTiming),testFile=prepareTestFile('legacy','platform.test.cjs'),prepared=fs.readFileSync(testFile,'utf8');
  const relative=`../../docs/garden-phase7c/platform-health-timing-${stamp}.json`;
  assert.equal(prepared,source.replace('../../docs/garden-phase6c/platform-health-timing.json',relative));
  assert.ok(!prepared.includes('../../docs/garden-phase6c/platform-health-timing.json'));
  new vm.Script(prepared,{filename:testFile}); // Syntax only; do not start suites/emulators.
  const output=path.resolve(path.dirname(testFile),relative);
  assert.ok(output.startsWith(docs+path.sep));assert.equal(hash(originalTiming),before);
  const result={at:new Date().toISOString(),passed:true,noEmulatorStarted:true,assertionsChanged:false,
   originalTestSha256:hash(sourceFile),testFile:path.relative(root,testFile),timingOutput:path.relative(root,output),
   earlierTimingSha256:before,earlierTimingUnchanged:true};
  fs.writeFileSync(path.join(docs,`artifact-routing-check-${stamp}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result,null,2));return;
 }
 const modes=process.argv.includes('--safety-only')?[['safety','safety-platform.test.cjs']]:[['legacy','platform.test.cjs'],['controlled','controlled-platform.test.cjs'],['safety','safety-platform.test.cjs']];
 for(const [mode,file]of modes)await suite(mode,file);
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
 if(process.argv.includes('--check-artifact-routing'))return;
 try{await stop();}catch(error){console.error(error.message);process.exitCode=1;}
 fs.writeFileSync(path.join(docs,`platform-results-${stamp}.json`),JSON.stringify({completedAt:new Date().toISOString(),node:process.version,hostOnly:true,androidOrFirewallChanges:false,productionAccess:false,results,passed:!process.exitCode},null,2)+'\n',{flag:'wx'});
});
