'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),ts=require(require.resolve('typescript',{paths:[path.join(root,'apps/mobile')]}));
function evaluate(source,imports,{tsx=false}={}){const m={exports:{}};const code=ts.transpileModule(source,{fileName:tsx?'review.tsx':'review.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('module','exports','console','require',code)(m,m.exports,{error(){},warn(){}},name=>{assert.ok(Object.hasOwn(imports,name),'Unexpected source import: '+name);return imports[name];});return m.exports;}
function loadWriter(kind,sdk,db,{legacy=false,conversation=async()=>null,nativeProject}={}){
 const file=kind==='MAIN'?'integration/message-outbox/MAIN_WRITER_'+(legacy?'BASE':'CANDIDATE')+'.ts':legacy?'integration/message-outbox/LEGACY_V31_WRITER.ts':'packages/shared-services/src/services/messaging.service.ts';
 const source=fs.readFileSync(path.join(root,file),'utf8'),sideEffects=[];
 if(kind==='MAIN'){const manifest=JSON.parse(fs.readFileSync(path.join(root,'integration/message-outbox/MANIFEST.json')));assert.equal(crypto.createHash('sha256').update(source).digest('hex'),legacy?manifest.mainWriterBaseSha256:manifest.mainWriterCandidateSha256);}
 const helper=evaluate(fs.readFileSync(path.join(root,'packages/shared-services/src/notifications/message-outbox.ts'),'utf8'),{});
 const policy=evaluate(fs.readFileSync(path.join(root,'packages/shared-services/src/notifications/message-outbox-policy'+(nativeProject?'.native':'')+'.ts'),'utf8'),{});
 if(nativeProject)db.app={options:{projectId:nativeProject}};
 const module=evaluate(source,{
  '@spartan-g/shared-types':{COLLECTIONS:{MESSAGES:'messages',CONVERSATIONS:'conversations'},PERMISSIONS:{SEND_MESSAGES:'send_messages'},hasPermission:role=>['student','facilitator','super_admin'].includes(role),PermissionError:class extends Error{}},
  '../firebase/firestore':{...sdk,getFirestoreDb:()=>db},'../notifications/message-outbox':helper,'../notifications/message-outbox-policy':policy,
  '../repositories/conversation.repository':{conversationRepository:{getById:conversation}},'../repositories/message.repository':{messageRepository:{}},
  '../repositories/user.repository':{userRepository:{getById:async()=>({displayName:'Synthetic sender'})}},'../repositories/notification.repository':{notificationRepository:{}},
  './notification.service':{notificationService:{createInAppNotification:async row=>sideEffects.push(row)}},
  './push-notification.service':{pushNotificationService:{}},'./user.service':{userService:{}},
 });
 const writer=module.messagingService;
 if(kind==='APP')writer.sendMessagePushNotification=async(...args)=>sideEffects.push(args);
 return{writer,sideEffects};
}
function memoryWriter(kind,options={}){
 const rows=new Map([['conversations/thread',{participantIds:['student_A','facilitator_A'],unreadCount:{student_A:2,facilitator_A:4},preserved:'existing'}]]),stamp=Object.freeze({serverTimestamp:true});let allocations=0,callbacks=0;const attempted=[];
 const sdk={collection:(_,name)=>({path:name}),doc:(parent,...segments)=>{const p=segments.length?segments.join('/'):parent.path+'/new_'+ ++allocations;return{path:p,id:p.split('/').at(-1)};},serverTimestamp:()=>stamp,
  runTransaction:async(_,work)=>{let pending;for(let i=0;i<=(options.retries??0);i++){callbacks++;pending=[];await work({get:async ref=>{if(options.readError)throw Error('Synthetic unavailable');return{exists:()=>rows.has(ref.path),data:()=>rows.get(ref.path)};},set:(ref,data)=>{attempted.push(ref.path);if(options.reject?.(ref.path))throw Error('Synthetic rejected write');pending.push({ref,data});},update:(ref,data)=>{if(options.reject?.(ref.path))throw Error('Synthetic rejected update');pending.push({ref,data:{...rows.get(ref.path),...data}});}});}for(const w of pending)rows.set(w.ref.path,w.data);if(options.unknownCommit)throw Error('Synthetic lost commit response');},
 };
 return{...loadWriter(kind,sdk,{}, {legacy:options.legacy,nativeProject:options.nativeProject,conversation:async()=>rows.get('conversations/thread')}),rows,stamp,attempted,allocations:()=>allocations,callbacks:()=>callbacks};
}
module.exports={root,loadWriter,memoryWriter,evaluate};
