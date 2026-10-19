// Preserve all earlier phase scripts/evidence; retarget their output to this phase.
const fs=require('node:fs'),path=require('node:path');const here=__dirname;
for(const name of ['regressions.cjs','platform-runner.cjs','run-http-tests.cjs','client-validation.cjs','transport-capability.test.cjs','cleanup-runtime.cjs']){
 const source=fs.readFileSync(path.resolve(here,'../garden-phase7a',name),'utf8').replaceAll('garden-phase7a','garden-phase7b');
 fs.writeFileSync(path.join(here,name),source,{flag:'wx'});
}
console.log('Six scoped runners copied; original sources preserved.');
