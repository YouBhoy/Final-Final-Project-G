'use strict';
const path=require('node:path'),root=path.resolve(__dirname,'../../..');
const {pilot}=require('./notification-pilot/resolve.cjs');
function readProfile(value){if(value===undefined||value===''||value==='production')return 'production';if(value==='staging-v25')return value;throw Error('android_profile_invalid');}
const replacements={
 'packages/shared-services/src/config/env.native.ts':'env.native.ts',
 'packages/shared-services/src/config/env.normal.native.ts':'env.native.ts',
 'packages/shared-services/src/config/env.ts':'env.native.ts',
 'packages/shared-services/src/config/env.web.ts':'env.native.ts',
 'apps/mobile/src/assessment-finalization/http.ts':'submission-http.ts',
 'apps/mobile/src/adapters/expo-messaging.adapter.ts':'messaging.ts',
 'apps/mobile/src/notifications/NotificationCoordinator.tsx':'NotificationCoordinator.tsx',
 'apps/mobile/src/notifications/PrivateFcmTest.tsx':'NotificationSettings.tsx',
 'apps/mobile/src/notifications/PhoneNotificationPreparation.tsx':'NotificationSettings.tsx',
 'packages/shared-services/src/firebase/app-check.native.ts':'app-check.ts',
 'apps/mobile/src/navigation/linking.ts':'linking.ts',
};
function stagingResolution(resolution,context,platform,profile){
 const notificationPilot=pilot(readProfile(profile));
 if(readProfile(profile)!=='staging-v25')return resolution;
 if(platform!=='android'||context.dev!==false)throw Error('staging_requires_android_release');
 if(resolution.type!=='sourceFile'&&resolution.type!=='assetFiles')return resolution;
 const files=resolution.type==='sourceFile'?[resolution.filePath]:resolution.filePaths;
 for(const f of files)if(/(?:^|\/)\.env(?:\.|$)|\.(?:jks|keystore|p12|pfx|pem|key)$|google-services\.json$|service.account/i.test(path.relative(root,f).replaceAll('\\','/')))throw Error('staging_sensitive_module_rejected');
 if(resolution.type!=='sourceFile')return resolution;
 const rel=path.relative(root,resolution.filePath).replaceAll('\\','/');
 if(/^apps\/mobile\/staging\/(?:profile\.cjs|Run-StagingBuild\.ps1|native\.gradle)$/.test(rel))throw Error('staging_build_helper_in_app_graph');
 if(/(?:^|\/)@firebase\/(?:analytics|messaging)(?:-|\/)/.test(rel))throw Error('staging_tracking_or_messaging_sdk_rejected');
 if(/(?:^|\/)firebase-admin(?:\/|$)|(?:^|\/)@google-cloud\//.test(rel))throw Error('staging_privileged_sdk_rejected');
 if(rel.includes('/expo-notifications/')&&!notificationPilot){if(!/\/(?:build|src)\/index\.[jt]s$/.test(rel))throw Error('staging_notification_submodule_rejected');return{type:'sourceFile',filePath:path.join(__dirname,'notifications.ts')};}
 if(rel==='packages/shared-services/src/config/firebase-app-id.ts')throw Error('production_android_registration_guard_in_staging_graph');
 if(rel==='packages/shared-services/src/services/push-notification.service.ts')return {type:'sourceFile',filePath:path.join(root,'packages/shared-services/src/services/push-notification.service.native.ts')};
 const normalized=p=>path.resolve(p).replaceAll('\\','/');
 const originalLinking=rel==='apps/mobile/src/navigation/linking.ts'&&typeof context.originModulePath==='string'&&normalized(context.originModulePath)===normalized(path.join(__dirname,'linking.ts'));
 if(notificationPilot){
  if(rel==='apps/mobile/src/notifications/runtime.ts')return{type:'sourceFile',filePath:path.join(__dirname,'notification-pilot/runtime.ts')};
  const originalCoordinator=rel==='apps/mobile/src/notifications/NotificationCoordinator.tsx'&&normalized(context.originModulePath||'')===normalized(path.join(__dirname,'notification-pilot/Coordinator.tsx'));
  if(rel==='apps/mobile/src/notifications/NotificationCoordinator.tsx')return originalCoordinator?resolution:{type:'sourceFile',filePath:path.join(__dirname,'notification-pilot/Coordinator.tsx')};
  if(['apps/mobile/src/adapters/expo-messaging.adapter.ts','apps/mobile/src/notifications/PhoneNotificationPreparation.tsx'].includes(rel))return resolution;
 }
 return replacements[rel]&&!originalLinking?{type:'sourceFile',filePath:path.join(__dirname,replacements[rel])}:resolution;
}
module.exports={readProfile,stagingResolution,replacements};
