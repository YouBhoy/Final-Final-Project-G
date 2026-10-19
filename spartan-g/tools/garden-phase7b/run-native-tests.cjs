const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7b'),stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const log=`native-security-${stamp}.tap`,fd=fs.openSync(path.join(docs,log),'wx');
const result=cp.spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1','tools/garden-phase7b/native-security.test.cjs'],{
 cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);
const summary=fs.readFileSync(path.join(docs,log),'utf8').split(/\r?\n/).filter(l=>/^# (tests|pass|fail|skipped) /.test(l));
const record={at:new Date().toISOString(),node:process.version,passed:result.status===0,code:result.status,log,summary,androidRuntimeTested:false,apkBuilt:false};
fs.writeFileSync(path.join(docs,`native-security-${stamp}.json`),JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record,null,2));if(!record.passed)process.exitCode=1;
