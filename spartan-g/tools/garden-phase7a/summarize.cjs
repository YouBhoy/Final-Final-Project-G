// Aggregate final applicable local runs; never add repeat runs to distinct-test totals.
const fs=require('node:fs'),path=require('node:path');
const docs=path.resolve(__dirname,'../../docs/garden-phase7a');
function latest(pattern){const name=fs.readdirSync(docs).filter(n=>pattern.test(n)).sort().at(-1);if(!name)throw Error('Missing final run');return {name,data:JSON.parse(fs.readFileSync(path.join(docs,name),'utf8'))};}
function total(results){return results.reduce((n,r)=>n+Number(r.summary?.find(s=>/^# tests /.test(s))?.split(' ').at(-1)??0),0);}
const core=latest(/^run-\d+T\d+Z\.json$/),platform=latest(/^platform-results-\d+T\d+Z\.json$/),http=latest(/^http-run-\d+T\d+Z\.json$/),client=latest(/^client-validation-\d+T\d+Z\.json$/);
const counts={existingBackendAndRules:total(core.data.results),existingCallableRouting:total(platform.data.results),
 existingClientPlusRedirectDiagnostics:total([client.data.tests]),externalHttpAndHost:total(http.data.results)};
const passed=core.data.allCommandsPassed&&platform.data.passed&&http.data.passed&&client.data.passed
 &&counts.existingBackendAndRules===403&&counts.existingCallableRouting===28&&counts.existingClientPlusRedirectDiagnostics===45&&counts.externalHttpAndHost===63;
const result={at:new Date().toISOString(),node:process.version,baselineDistinctTests:474,
 distinctFinalTests:Object.values(counts).reduce((a,b)=>a+b,0),counts,redirectDiagnostics:2,
 evidence:{core:core.name,platform:platform.name,http:http.name,client:client.name},
 mobile:client.data.mobile,androidExternalIntegration:false,productionAccess:false,productionReadiness:'NOT READY',passed};
fs.writeFileSync(path.join(docs,'validation-summary.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));if(!passed)process.exitCode=1;
