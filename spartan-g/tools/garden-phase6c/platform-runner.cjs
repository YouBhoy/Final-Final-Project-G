// Host-only process orchestration. Stops only this runner's emulator children.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase6c');
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
async function suite(mode,file){
 fd=fs.openSync(path.join(docs,`launcher-${mode}-${stamp}.log`),'wx');
 child=cp.spawn(process.execPath,[path.join(__dirname,'start.cjs'),'--host-only',...(mode==='legacy'?[]:[mode==='controlled'?'--controlled':'--safety'])],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});
 let ready=false;
 for(let i=0;i<150;i++){
  if(child.exitCode!==null)throw Error(`${mode} launcher exited; inspect its local log`);
  try{const r=await fetch('http://127.0.0.1:19098/health',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}
  await delay(500);
 }
 if(!ready)throw Error(`${mode} host readiness timed out`);
 const log=path.join(docs,`platform-${mode}-${stamp}.tap`),out=fs.openSync(log,'wx');
 let code;try{code=await new Promise((resolve,reject)=>{const proc=cp.spawn(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',path.join(__dirname,file)],{cwd:root,windowsHide:true,stdio:['ignore',out,out]});proc.once('error',reject);proc.once('exit',resolve);});}finally{fs.closeSync(out);}
 const summary=fs.readFileSync(log,'utf8').split('\n').filter(line=>/^# (tests|pass|fail|skipped) /.test(line));
 results.push({mode,code,log:path.basename(log),summary});console.log(`${mode}: ${code===0?'PASS':'FAIL'} ${summary.join('; ')}`);
 await stop();if(code!==0)throw Error(`${mode} routing tests failed`);
}
(async()=>{
 const modes=process.argv.includes('--safety-only')?[['safety','safety-platform.test.cjs']]:[['legacy','platform.test.cjs'],['controlled','controlled-platform.test.cjs'],['safety','safety-platform.test.cjs']];
 for(const [mode,file]of modes)await suite(mode,file);
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
 try{await stop();}catch(error){console.error(error.message);process.exitCode=1;}
 fs.writeFileSync(path.join(docs,`platform-results-${stamp}.json`),JSON.stringify({completedAt:new Date().toISOString(),node:process.version,hostOnly:true,androidOrFirewallChanges:false,productionAccess:false,results,passed:!process.exitCode},null,2)+'\n',{flag:'wx'});
});
