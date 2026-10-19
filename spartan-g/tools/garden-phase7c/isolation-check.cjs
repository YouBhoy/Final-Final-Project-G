// Packet-level checks from the app UID to local synthetic listeners only. No production probe.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),http=require('node:http');
const docs=path.resolve(__dirname,'../../docs/garden-phase7c'),adb=path.join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');
async function main(){const firewall=require('./device-firewall.cjs').status();if(!firewall.isolated)throw Error('Exact Phase 7C isolation required');
 let deniedListenerRequests=0,deniedListenerConnections=0;const server=http.createServer((_q,r)=>{deniedListenerRequests++;r.end('synthetic-listener');});
 server.on('connection',()=>deniedListenerConnections++);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(18090,'127.0.0.1',resolve);});
 try{
 const code=await new Promise((resolve,reject)=>{const p=cp.spawn(process.execPath,[path.join(__dirname,'inspector.cjs'),'--connectivity','--first'],{windowsHide:true,stdio:'ignore'});p.once('error',reject);p.once('exit',resolve);});
 if(code!==0)throw Error('Actual Android allowed-port request failed; no sign-in or integration test is safe');
 const allowed=JSON.parse(fs.readFileSync(path.join(docs,'android-connectivity.json'),'utf8'));
 const args=['-s','emulator-5554','shell','run-as','com.spartang.mobile','/system/bin/toybox','nc','-z','-w','2','10.0.2.2','18090'];
 const denied=await new Promise(resolve=>{const p=cp.spawn(adb,args,{windowsHide:true,stdio:['ignore','ignore','ignore']});p.once('exit',code=>resolve({code}));});
 fs.appendFileSync(path.join(docs,'device-commands.jsonl'),JSON.stringify({at:new Date().toISOString(),args,code:denied.code})+'\n');await new Promise(r=>setImmediate(r));
 const result={at:new Date().toISOString(),uid:firewall.uid,allowedHost:'10.0.2.2',allowedHealthHttp200:allowed.passed&&allowed.status===200,allowedSyntheticProject:allowed.projectId==='demo-spartan-g-garden-phase2',allowedProbe:'real Android fetch through local Hermes inspector',deniedPort:18090,deniedConnectionFailed:denied.code!==0,deniedListenerConnections,deniedListenerRequests,productionDestinationProbed:false};
 result.passed=result.allowedHealthHttp200&&result.allowedSyntheticProject&&result.deniedConnectionFailed&&deniedListenerConnections===0&&deniedListenerRequests===0;
 fs.writeFileSync(path.join(docs,'isolation-connectivity.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
