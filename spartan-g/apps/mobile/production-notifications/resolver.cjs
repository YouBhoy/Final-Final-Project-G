'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../..');
const ts=require(require.resolve('typescript',{paths:[path.join(root,'apps/mobile')]})),m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'policy.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});
function productionNotificationResolution(resolution,context,platform,presentationProfile,plan) {
 if(presentationProfile===undefined||presentationProfile===null||presentationProfile==='')return resolution;
 m.exports.validateProductionNotifications(plan??require('./plan.json'),34);
 if(platform!=='android'||context.dev!==false||presentationProfile!=='production-presentation-v34')throw Error('Production notification release guard rejected');
 if(resolution.type!=='sourceFile')return resolution;
 const relative=path.relative(root,resolution.filePath).replaceAll('\\','/');
 if(/^apps\/mobile\/staging\/|firebase-admin|@google-cloud/.test(relative))throw Error('Production notification unsafe module');
 if(relative==='apps/mobile/src/notifications/runtime.ts')return{type:'sourceFile',filePath:path.join(__dirname,'runtime.ts')};
 if(relative==='apps/mobile/src/notifications/NotificationCoordinator.tsx'&&path.resolve(context.originModulePath||'')!==path.join(__dirname,'Coordinator.tsx'))return{type:'sourceFile',filePath:path.join(__dirname,'Coordinator.tsx')};
 return resolution;
}
module.exports={productionNotificationResolution};
