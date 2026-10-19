const fs=require('node:fs'),path=require('node:path');const docs=path.resolve(__dirname,'../../docs/garden-phase7b');
function pick(pattern,accept=()=>true){const files=fs.readdirSync(docs).filter(n=>pattern.test(n)).sort().reverse();for(const name of files){const data=JSON.parse(fs.readFileSync(path.join(docs,name),'utf8'));if(accept(data))return {name,data};}throw Error('Missing run evidence');}
function tests(records){return records.reduce((n,r)=>n+Number(r.summary?.find(l=>/^# tests /.test(l))?.split(' ').at(-1)??0),0);}
const core=pick(/^run-\d+T\d+Z\.json$/),platform=pick(/^platform-results-\d+T\d+Z\.json$/),client=pick(/^client-validation-\d+T\d+Z\.json$/),
 http=pick(/^http-run-\d+T\d+Z\.json$/,d=>d.results.some(r=>r.name==='external-http-tests')),
 nativeApi=pick(/^http-run-\d+T\d+Z\.json$/,d=>d.results.some(r=>r.name==='native-emulator-tests')),
 native=pick(/^native-security-\d+T\d+Z\.json$/);
const counts={existingBackendAndRules:tests(core.data.results),existingCallableRouting:tests(platform.data.results),
 existingClientAndTwoLimitationDiagnostics:tests([client.data.tests]),existingHttpBackend:tests(http.data.results),
 newNativeSecurity:tests([native.data]),newNativeFirebaseIntegration:tests(nativeApi.data.results)};
const result={at:new Date().toISOString(),node:process.version,counts,distinctFinalChecks:Object.values(counts).reduce((a,b)=>a+b,0),
 evidence:Object.fromEntries(Object.entries({core,platform,client,http,native,nativeApi}).map(([name,value])=>[name,value.name])),
 mobile:client.data.mobile,androidRuntimeTested:false,apkBuilt:false,externalRoutingEnabled:false,productionAccess:false,productionReadiness:'NOT READY',
 passed:core.data.allCommandsPassed&&platform.data.passed&&client.data.passed&&http.data.passed&&native.data.passed&&nativeApi.data.passed
  &&JSON.stringify(Object.values(counts))===JSON.stringify([403,28,45,63,26,10])};
fs.writeFileSync(path.join(docs,'validation-summary.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
