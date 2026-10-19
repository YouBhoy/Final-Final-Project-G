// Local Hermes inspector only. No application files, credentials or routing gates are modified.
const fs=require('node:fs'),path=require('node:path');
const docs=path.resolve(__dirname,'../../docs/garden-phase7c');
async function main(){
 if(!require('./device-firewall.cjs').status().isolated)throw Error('Verified Phase 7C app isolation required');
 const health=await fetch('http://127.0.0.1:19098/health').then(r=>r.json());if(health.ready!==true||health.deviceIsolation!==true||health.projectId!=='demo-spartan-g-garden-phase2')throw Error('Synthetic local environment required');
 const pages=await fetch('http://127.0.0.1:8083/json/list').then(r=>r.json());
 if(process.argv.includes('--list')){console.log(JSON.stringify(pages,null,2));return;}
 const matches=pages.filter(p=>p.appId==='com.spartang.mobile');
 const page=(process.argv.includes('--first')?matches[0]:matches.at(-1))??pages.find(p=>p.vm==='Hermes'||p.title?.includes('Hermes'));
 if(!page)throw Error('Expected local Hermes target not found');
 const url=new URL(page.webSocketDebuggerUrl);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='8083'||url.protocol!=='ws:')throw Error('Unexpected inspector destination');
 const ws=new WebSocket(url),pending=new Map();let next=1;
 const timer=setTimeout(()=>{ws.close();for(const p of pending.values())p.reject(Error('Local inspector deadline'));},30000);
 try{await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',()=>j(Error('Local inspector failed')),{once:true});});
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 ws.addEventListener('message',event=>{const v=JSON.parse(event.data),p=pending.get(v.id);if(p){pending.delete(v.id);if(v.error)p.reject(Error('Inspector command failed'));else p.resolve(v.result);}});
 await command('Runtime.enable');
 const connectivity=process.argv.includes('--connectivity');
 let expression=connectivity?`fetch('http://10.0.2.2:19098/health').then(function(r){return r.json().then(function(h){return {checks:[{name:'real Android fetch reaches allowed local host',passed:r.status===200},{name:'local synthetic environment and firewall confirmed',passed:h.ready===true&&h.deviceIsolation===true&&h.projectId==='demo-spartan-g-garden-phase2'}],status:r.status,projectId:h.projectId,deviceIsolation:h.deviceIsolation,productionProbe:false};});})`:
  process.argv.includes('--modules')?
  "JSON.stringify(Array.from(globalThis.__r.getModules()).filter(([id,m])=>/NativeModules|expo-font.*index|AssetRegistry/.test(m.verboseName||'')).map(([id,m])=>({id,name:m.verboseName,initialized:m.isInitialized})))":
  fs.readFileSync(path.join(__dirname,'android-probe.js'),'utf8');
 const wrapped="globalThis.__sg7cDone=false;globalThis.__sg7cValue=null;globalThis.__sg7cError=null;Promise.resolve("+expression+").then(function(v){globalThis.__sg7cValue=v;globalThis.__sg7cDone=true;},function(e){globalThis.__sg7cError={name:e.name,message:e.message};globalThis.__sg7cDone=true;});void 0";
 const result=await command('Runtime.evaluate',{expression:wrapped,returnByValue:true});
 if(result.exceptionDetails){const detail={text:result.exceptionDetails.text,description:result.exceptionDetails.exception?.description?.slice(0,500)};console.error(JSON.stringify(detail));throw Error('Android probe threw; no application data collected');}
 let value,done=false;for(let i=0;i<40;i++){const poll=await command('Runtime.evaluate',{expression:'({done:globalThis.__sg7cDone,value:globalThis.__sg7cValue,error:globalThis.__sg7cError})',returnByValue:true});const state=poll.result?.value;if(state?.done){if(state.error)throw Error('Android probe: '+state.error.name+' '+state.error.message);value=state.value;done=true;break;}await new Promise(r=>setTimeout(r,250));}
 if(!done)throw Error('Android probe completion timed out');
 await command('Runtime.evaluate',{expression:'delete globalThis.__sg7cDone;delete globalThis.__sg7cValue;delete globalThis.__sg7cError;void 0',returnByValue:true});
 if(typeof value==='string'){console.log(value);return;}
 const record={at:new Date().toISOString(),device:'emulator-5554',runtime:'Hermes on Android 35, 16 KB pages',...value};record.passed=record.checks?.length>0&&record.checks.every(c=>c.passed);
 fs.writeFileSync(path.join(docs,connectivity?'android-connectivity.json':'android-bridge-runtime.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));if(!record.passed)process.exitCode=1;
 }finally{clearTimeout(timer);ws.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
