// Test-only JVM bridge and TLS servers. Never imported by application code.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),readline=require('node:readline'),https=require('node:https'),vm=require('node:vm');
const {randomUUID}=require('node:crypto'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),state=JSON.parse(fs.readFileSync(path.join(root,'docs/garden-phase7b/jvm-runtime.json'),'utf8'));
const ts=require(path.join(root,'apps/mobile/node_modules/typescript'));
function load(relative,imports={}){const module={exports:{}};const source=fs.readFileSync(path.join(root,relative),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,AbortSignal,AbortController,Map,Set,Promise,Object,Error,JSON,Number,String,
  require:name=>{if(!Object.hasOwn(imports,name))throw Error(`Unexpected test import ${name}`);return imports[name];}});return module.exports;}
const client=load('apps/mobile/src/garden/externalGardenClient.ts');
async function tlsServer(handler){const sockets=new Set();const server=https.createServer({key:fs.readFileSync(path.join(state.runtime,'test-key.pem')),cert:fs.readFileSync(path.join(state.runtime,'test-cert.pem'))},handler);
 server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,origin:`https://127.0.0.1:${server.address().port}`,
  async close(){for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}};}
async function bridge(origin,newer=false,trusted=true){
 const child=cp.spawn(state.java,[...(trusted?[`-Djavax.net.ssl.trustStore=${state.keystore}`,'-Djavax.net.ssl.trustStorePassword=synthetic-local-only']:[]),
  '-cp',newer?state.classpathNewer:state.classpath,state.entry,origin],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const pending=new Map();let diagnostics='';child.stderr.on('data',b=>{diagnostics+=b;});
 let readyResolve,readyReject;const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
 const timer=setTimeout(()=>readyReject(Error('Synthetic JVM readiness timeout')),15000);
 const lines=readline.createInterface({input:child.stdout});
 lines.on('line',line=>{if(line==='READY'){clearTimeout(timer);readyResolve();return;}
  const [kind,key,...fields]=line.split('\t'),task=pending.get(key);if(!task)return;pending.delete(key);clearTimeout(task.timer);
  if(kind==='R')task.resolve({status:Number(fields[0]),retryAfterSeconds:Number(fields[1]),body:Buffer.from(fields[2],'base64').toString('utf8')});
  else task.reject({code:'E_GARDEN_TRANSPORT',message:'Garden request could not be confirmed.',userInfo:{reason:fields[0],retryable:fields[1]==='true',outcomeUnknown:fields[2]==='true'}});
 });
 child.once('exit',()=>{clearTimeout(timer);readyReject(Error('Synthetic JVM exited'));
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Synthetic JVM exited'));}pending.clear();});
 await ready;
 const api={getConfiguration:async()=>({version:1,enabled:true,origin}),
  request(key,action,id,token='synthetic.jwt.value',timeout=75000){return new Promise((resolve,reject)=>{
   const wire=randomUUID();const timer=setTimeout(()=>{pending.delete(wire);reject(Error('Synthetic harness timeout'));},Math.min(timeout+10000,100000));
   pending.set(wire,{resolve,reject,timer});child.stdin.write(`R\t${wire}\t${key}\t${Buffer.from(action+'\0'+id).toString('base64')}\t${Buffer.from(token).toString('base64')}\t${timeout}\n`);
  });},
  cancel:async key=>{child.stdin.write(`C\t${key}\n`);return true;},
  async close(){if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.stdin.end('X\n');await exited;}lines.close();},
  diagnostics:()=>diagnostics};return api;
}
function transport(native,{uid='synthetic-student',token='synthetic.jwt.value',terminals=new Map(),timeoutMs=75000,currentUser}={}){
 return new client.ExternalGardenClient({enabled:true,bridge:native,timeoutMs,requestKey:randomUUID,
  currentUser:currentUser??(()=>({uid,getIdToken:async()=>token})),
  terminals:{read:async(u,id)=>terminals.has(`${u}:${id}`),write:async(u,id)=>{terminals.set(`${u}:${id}`,true);}}});}
module.exports={...client,root,state,load,tlsServer,bridge,transport,randomUUID,backend:createRequire(path.join(root,'functions/package.json'))};
