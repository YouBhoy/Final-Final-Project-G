// Local review artifact only. Never invokes Firebase CLI, installs packages or activates controls.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase6c');
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
const target=path.join(os.tmpdir(),`spartan-g-garden-production-review-${stamp}`),source=path.join(target,'functions');
if(fs.existsSync(target))throw Error('Fresh staging target required; nothing will be overwritten');
fs.mkdirSync(path.join(source,'lib'),{recursive:true});
for(const name of ['garden','garden-rewards','garden-watering','garden-production'])fs.cpSync(path.join(root,'functions/lib',name),path.join(source,'lib',name),{recursive:true,filter:file=>!path.basename(file).startsWith('local-functions.')});
fs.copyFileSync(path.join(root,'functions/lib/production-garden.js'),path.join(source,'lib/production-garden.js'));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'functions/package.json'),'utf8'));
fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({...pkg,main:'lib/production-garden.js',scripts:{}},null,2)+'\n');
fs.copyFileSync(path.join(root,'functions/package-lock.json'),path.join(source,'package-lock.json'));
fs.writeFileSync(path.join(target,'firebase.json'),JSON.stringify({functions:[{source:'functions',codebase:'garden',runtime:'nodejs22'}]},null,2)+'\n');
const files=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else files.push({path:path.relative(target,file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}}
walk(target);
const result={preparedAt:new Date().toISOString(),target,config:path.join(target,'firebase.json'),projectForLaterApproval:'spartan-g-a2d80',database:'(default)',region:'asia-southeast1',main:'lib/production-garden.js',codebase:'garden',exports:['assessmentSubmitted','recoverAssessmentReward','waterGarden'],notificationEntryIncluded:fs.existsSync(path.join(source,'lib/index.js')),emulatorEntryIncluded:fs.existsSync(path.join(source,'lib/local-garden.js')),nodeModulesInstalled:false,cliInvoked:false,activationControlsCreated:false,files};
if(result.notificationEntryIncluded||result.emulatorEntryIncluded)throw Error('Unexpected entry in staged source');
fs.writeFileSync(path.join(docs,`production-stage-${stamp}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({target,main:result.main,exports:result.exports,notificationEntryIncluded:false,cliInvoked:false}));
