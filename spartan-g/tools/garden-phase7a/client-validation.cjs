// Existing mocked client/configuration tests and read-only mobile TypeScript only.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7a');
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
function run(args,name){const result=cp.spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
 const log=`${name}-${stamp}.log`,output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(docs,log),output,{flag:'wx'});
 return {name,exitCode:result.status,log,output};}
if(process.versions.node!=='22.23.3')throw Error('Existing pinned Node 22 required; nothing will be installed');
const tests=run(['--test','--test-reporter=tap','--test-concurrency=1','tools/garden-phase6a/client.test.cjs',
 'tools/garden-phase6a/configuration.test.cjs','tools/garden-phase6a/cleanup.test.cjs','tools/garden-phase6c/export-manifest.test.cjs',
 'tools/garden-phase7a/transport-capability.test.cjs'],'client-configuration');
const mobile=run(['apps/mobile/node_modules/typescript/bin/tsc','--noEmit','-p','apps/mobile/tsconfig.json'],'mobile-typescript');
const errors=mobile.output.split(/\r?\n/).filter(line=>line.includes('error TS'));
const onlyKnownAppointmentError=mobile.exitCode===2&&errors.length===1&&errors[0].includes('AppointmentsScreen.tsx(113,36)')&&errors[0].includes("'rejectAppointment'");
const result={at:new Date().toISOString(),node:process.version,tests:{name:tests.name,exitCode:tests.exitCode,log:tests.log,
 summary:tests.output.split(/\r?\n/).filter(l=>/^# (tests|pass|fail|skipped) /.test(l))},
 mobile:{exitCode:mobile.exitCode,log:mobile.log,errors,onlyKnownAppointmentError},productionAccess:false,androidAccess:false,
 passed:tests.exitCode===0&&onlyKnownAppointmentError};
fs.writeFileSync(path.join(docs,`client-validation-${stamp}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
