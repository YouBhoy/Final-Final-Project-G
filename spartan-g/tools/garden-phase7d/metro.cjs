// Explicit local development bundle only; Firebase providers remain blocked, no synthetic readiness.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7d');let child,fd,stopping=false;
async function main(){if(!require('./device-firewall.cjs').status().isolated)throw Error('Phase 7D isolation required');
 await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(8083,'127.0.0.1',()=>s.close(resolve));});
 const env={...process.env,EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE:'1',EXPO_PUBLIC_APP_ENV:'development',EXPO_NO_DOTENV:'1',EXPO_OFFLINE:'1',EXPO_NO_TELEMETRY:'1',REACT_NATIVE_PACKAGER_HOSTNAME:'10.0.2.2',NODE_ENV:'development',PATH:path.dirname(process.execPath)+';'+process.env.PATH};
 for(const k of Object.keys(env))if(/^(EXPO_PUBLIC|VITE)_(FIREBASE|GEMINI)/.test(k))delete env[k];
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');fd=fs.openSync(path.join(docs,'metro-'+stamp+'.log'),'wx');
 child=cp.spawn(process.execPath,[path.join(__dirname,'metro-entry.cjs')],{cwd:path.join(root,'apps/mobile'),env,windowsHide:true,stdio:['ignore',fd,fd]});
 fs.writeFileSync(path.join(docs,'metro-state.json'),JSON.stringify({at:new Date().toISOString(),owner:'phase7d',parentPid:process.pid,childPid:child.pid,host:'127.0.0.1',port:8083,localOptIn:true,firebaseEmulatorsStarted:false},null,2)+'\n');
 child.once('exit',code=>{if(!stopping){fs.closeSync(fd);process.exitCode=code||0;}});
 let manifest;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Owned Metro exited');try{const r=await fetch('http://127.0.0.1:8083/',{headers:{'expo-platform':'android'},signal:AbortSignal.timeout(2000)});if(r.ok){manifest=await r.json();break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 const bundle=new URL(manifest?.launchAsset?.url);if(bundle.hostname!=='10.0.2.2'||bundle.port!=='8083'||bundle.protocol!=='http:')throw Error('Unexpected local bundle URL');bundle.hostname='127.0.0.1';
 const r=await fetch(bundle,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Local bundle failed');await r.arrayBuffer();console.log('Loopback-only local Metro ready. Firebase providers intentionally not ready.');}
main().catch(e=>{console.error(e.message);stop();process.exitCode=1;});
function stop(){if(stopping)return;stopping=true;if(child&&child.exitCode===null)cp.spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});if(fd!==undefined)fs.closeSync(fd);}
process.on('SIGINT',()=>{stop();process.exit();});process.on('SIGTERM',()=>{stop();process.exit();});
