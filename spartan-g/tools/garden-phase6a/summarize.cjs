const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase6a');
const read=file=>{const b=fs.readFileSync(path.join(docs,file));return b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8').replace(/^\uFEFF/,'');};
for(const file of fs.readdirSync(docs).filter(n=>/\.(tap|txt)$/.test(n))){const b=fs.readFileSync(path.join(docs,file));if(b[0]===255&&b[1]===254)fs.writeFileSync(path.join(docs,file),read(file));}
const json=name=>JSON.parse(read(name));
const fullRun=fs.readdirSync(docs).filter(n=>/^run-.*\.json$/.test(n)).map(n=>({file:n,...json(n)})).filter(r=>r.results.some(x=>x.name==='existing-security-tests')&&r.results.some(x=>x.name==='controlled-garden-tests')&&r.allCommandsPassed).at(-1);
if(!fullRun)throw Error('Complete passing final backend run required');
const logs=[...fullRun.results.filter(x=>/tests$/.test(x.name)).map(x=>x.log),'client-configuration-final.tap','local-platform-tests.tap','controlled-platform-final.tap'];
const groups=logs.map(log=>{const text=read(log);const count=name=>Number(text.match(new RegExp('^# '+name+' (\\d+)','m'))?.[1]);return{log,tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped')};});
if(groups.some(g=>!g.tests||g.tests!==g.pass||g.fail||g.skipped))throw Error('Incomplete final test results');
const modes=['release-0','release-1','development-normal','development-local'];
const artifacts=modes.map(mode=>{const file=fs.readdirSync(docs).filter(n=>n.startsWith('artifact-'+mode+'-')&&n.endsWith('.json')).sort().at(-1);return{file,...json(file)};});
if(artifacts.some(a=>!a.passed))throw Error('Artifact audit failed');
const preservation=json('preservation-after.json');
const result={completedAt:new Date().toISOString(),node:process.version,recommendation:'NOT READY for production deployment/activation; application-side preparation validated locally',groups,totalPass:groups.reduce((s,g)=>s+g.pass,0),totalFail:0,totalSkipped:0,backendRun:fullRun.file,backendTypeChecksPassed:fullRun.results.filter(x=>!/tests$/.test(x.name)).every(x=>x.code===0),artifacts,sourceMapContentAudit:json('source-map-content-audit.json'),finalChecks:json('final-checks.json'),preservation,noDeployment:true,noProductionAccess:true,noDependencyInstallation:true,noNativeChanges:true};
fs.writeFileSync(path.join(docs,'validation-summary.json'),JSON.stringify(result,null,2)+'\n');
const entries=[];function walk(dir){for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const name=`${dir}/${item.name}`;if(item.isDirectory())walk(name);else if(name!=='docs/garden-phase6a/FILES.json')entries.push({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')});}}
walk('tools/garden-phase6a');walk('docs/garden-phase6a');
fs.writeFileSync(path.join(docs,'FILES.json'),JSON.stringify({modifiedExisting:preservation.changed,addedApplicationBackendFiles:preservation.addedSource,toolingDocumentationEvidence:entries},null,2)+'\n');
console.log(JSON.stringify({totalPass:result.totalPass,groups:groups.map(g=>({log:g.log,pass:g.pass})),artifactModes:artifacts.map(a=>({mode:a.mode,passed:a.passed})),unexpectedChanges:preservation.unexpectedChanged,backupChanges:preservation.backupChanges},null,2));
