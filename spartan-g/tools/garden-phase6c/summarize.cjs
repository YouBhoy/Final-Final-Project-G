// Local evidence aggregation and file hashes; no application initialization/cloud requests.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase6c');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const groups=new Map(),platform=new Map();
function counts(lines){const get=name=>Number(lines.find(line=>line.startsWith(`# ${name} `))?.split(' ').at(-1));return {tests:get('tests'),pass:get('pass'),fail:get('fail'),skipped:get('skipped')};}
for(const file of fs.readdirSync(docs).filter(n=>/^run-.*\.json$/.test(n)).sort())for(const item of read(path.join(docs,file)).results){if(item.summary?.length)groups.set(item.name,{name:item.name,log:item.log,code:item.code,...counts(item.summary)});}
const client=fs.readFileSync(path.join(docs,'client-configuration.tap'),'utf8').split(/\r?\n/);
groups.set('client-configuration',{name:'client-configuration',log:'client-configuration.tap',code:0,...counts(client.filter(line=>/^# (tests|pass|fail|skipped) /.test(line)))});
for(const file of ['platform-results.json',...fs.readdirSync(docs).filter(n=>/^platform-results-.*\.json$/.test(n)).sort()]){
 for(const item of read(path.join(docs,file)).results)platform.set(item.mode,{name:`platform-${item.mode}`,log:item.log,code:item.code,...counts(item.summary)});
}
const suites=[...groups.values(),...platform.values()],final=read(path.join(docs,'final-checks.json')),preservation=read(path.join(docs,'preservation-after.json'));
const stageFile=fs.readdirSync(docs).filter(n=>/^production-stage-.*\.json$/.test(n)).sort().at(-1),stage=read(path.join(docs,stageFile));
const stagedChanged=stage.files.filter(item=>!fs.existsSync(path.join(stage.target,item.path))||sha(path.join(stage.target,item.path))!==item.sha256).map(item=>item.path);
const stagedBuildMismatches=stage.files.filter(item=>item.path.replace(/\\/g,'/').startsWith('functions/lib/')
 &&(!fs.existsSync(path.join(root,item.path))||sha(path.join(root,item.path))!==item.sha256)).map(item=>item.path);
const testedWorker=path.join(os.tmpdir(),'spartan-g-garden-phase6c/functions-local/lib');
const workerMismatches=[];
function compare(relative){for(const entry of fs.readdirSync(path.join(root,'functions/lib',relative),{withFileTypes:true})){const name=path.join(relative,entry.name);if(entry.isDirectory())compare(name);else if(!fs.existsSync(path.join(testedWorker,name))||sha(path.join(root,'functions/lib',name))!==sha(path.join(testedWorker,name)))workerMismatches.push(name);}}
for(const dir of ['garden','garden-rewards','garden-watering','garden-production'])compare(dir);
if(sha(path.join(root,'functions/lib/local-garden-safety.js'))!==sha(path.join(testedWorker,'local-garden-safety.js')))workerMismatches.push('local-garden-safety.js');
const reviewedReports=['docs/garden-phase5/REPORT.md','docs/garden-phase5/DEPLOYMENT_ROLLBACK.md','docs/garden-phase6a/REPORT.md','docs/garden-phase6a/ACTIVATION_AND_RELEASE.md','docs/garden-phase6b/REPORT.md','docs/garden-phase6b/SECURITY_AND_COST.md','docs/garden-phase6b/RELEASE_AND_INCIDENT_PLAN.md','docs/garden-mobile-phase4/REPORT.md','docs/sdk53-firestore-restoration/READINESS_REVIEW.md'];
const backendRuns=fs.readdirSync(docs).filter(n=>/^run-.*\.json$/.test(n)).sort().map(n=>read(path.join(docs,n)));
const latest=backendRuns.at(-1);
const result={completedAt:new Date().toISOString(),node:process.version,recommendation:'Local safety controls validated; NOT READY for production deployment/activation',
 suites,totalPass:suites.reduce((sum,s)=>sum+s.pass,0),totalFail:suites.reduce((sum,s)=>sum+s.fail,0),totalSkipped:suites.reduce((sum,s)=>sum+s.skipped,0),
 backendTypeChecks:latest.results.filter(item=>item.name.includes('build')||item.name.includes('typecheck')).map(item=>({name:item.name,code:item.code,log:item.log})),
 mobileDiagnostics:final.mobileDiagnostics,onlyKnownAppointmentError:final.onlyKnownAppointmentError,
 reviewedReports:reviewedReports.map(file=>({path:file,sha256:sha(path.join(root,file))})),
 candidateSha256:sha(path.join(root,'docs/sdk53-firestore-restoration/candidate.rules')),
 stagedArtifact:{manifest:stageFile,unchanged:stagedChanged.length===0,changed:stagedChanged, matchesCurrentBuild:stagedBuildMismatches.length===0, stagedBuildMismatches},
 testedWorkerMatchesCurrentCompiledCode:workerMismatches.length===0,workerMismatches,
 preservation,cleanup:final,productionAccess:false,productionDeployment:false,newDependencies:false,androidChanges:false};
result.passed=result.totalFail===0&&result.totalSkipped===0&&suites.every(s=>s.code===0&&s.tests===s.pass)
 &&result.backendTypeChecks.every(s=>s.code===0)&&result.onlyKnownAppointmentError
 &&!stagedChanged.length&&!stagedBuildMismatches.length&&!workerMismatches.length&&!preservation.unexpectedChanges.length&&!preservation.unexpectedAdditions.length
 &&!preservation.backupChanges.length&&!preservation.addedBackupFiles.length&&!final.ownedTestProcessesRemaining.length;
fs.writeFileSync(path.join(docs,'validation-summary.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:result.passed,totalPass:result.totalPass,totalFail:result.totalFail,totalSkipped:result.totalSkipped,workerMismatches,stagedChanged,onlyKnownAppointmentError:result.onlyKnownAppointmentError},null,2));
const broken=[];const report=path.join(docs,'REPORT.md');
if(fs.existsSync(report))for(const m of fs.readFileSync(report,'utf8').matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)){if(!/^https?:|^#/.test(m[1])&&!fs.existsSync(path.resolve(docs,m[1].split('#')[0])))broken.push(m[1]);}
const files=[];for(const folder of ['docs/garden-phase6c','tools/garden-phase6c']){function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(!p.endsWith('FILES.json'))files.push({path:p.replace(/\\/g,'/'),sha256:sha(path.join(root,p))});}}walk(folder);}
fs.writeFileSync(path.join(docs,'FILES.json'),JSON.stringify({at:result.completedAt,files,brokenReportLinks:broken},null,2)+'\n');
if(!result.passed||broken.length)process.exitCode=1;
