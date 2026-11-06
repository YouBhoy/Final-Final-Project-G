// Public client configuration only. Shared by Metro's runtime and local preflight.
export const PROFILE = 'staging-v25';
export const PROJECT = 'spartan-g-assessment-staging';
export const PROJECT_NUMBER = '1070381112794';
export const PACKAGE = 'com.spartang.mobile.staging';
export const SCHEME = 'spartan-g-staging';
export const HOST = 'spartang-assessment-staging.netlify.app';
export type PublicFirebase = Readonly<{apiKey:string;authDomain:string;projectId:string;storageBucket:string;messagingSenderId:string;appId:string}>;
function check(value:unknown,code:string):asserts value { if(!value)throw Error(code); }
function record(value:unknown):Record<string,unknown> { check(!!value&&typeof value==='object'&&!Array.isArray(value),'staging_config_object_required');return value as Record<string,unknown>; }
export function validateFirebaseOptions(value:unknown):PublicFirebase {
  const v=record(value),keys=['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  check(Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'staging_config_fields_invalid');
  check(keys.every(k=>typeof v[k]==='string'&&(v[k] as string).trim()===v[k]),'staging_config_types_invalid');
  check(v.projectId===PROJECT&&v.messagingSenderId===PROJECT_NUMBER,'staging_project_mismatch');
  check(v.authDomain===PROJECT+'.firebaseapp.com','staging_auth_domain_mismatch');
  check([PROJECT+'.appspot.com',PROJECT+'.firebasestorage.app'].includes(v.storageBucket as string),'staging_storage_mismatch');
  check(typeof v.appId==='string'&&new RegExp('^1:'+PROJECT_NUMBER+':android:[a-f0-9]{12,64}$').test(v.appId),'staging_android_registration_required');
  // Firebase client API keys are public identifiers, never Admin/service-account keys.
  check(typeof v.apiKey==='string'&&/^AIza[A-Za-z0-9_-]{35}$/.test(v.apiKey),'staging_public_api_key_invalid');
  return Object.freeze({...v}) as PublicFirebase;
}
export function parseGoogleServices(value:unknown):PublicFirebase {
  const v=record(value);check(Object.keys(v).every(k=>['project_info','client','configuration_version'].includes(k)),'google_services_fields_invalid');
  check(v.configuration_version==='1','google_services_version_invalid');
  const p=record(v.project_info);check(p.project_id===PROJECT&&p.project_number===PROJECT_NUMBER,'google_services_project_mismatch');
  check(Array.isArray(v.client)&&v.client.length===1,'google_services_client_ambiguous');
  const client=record(v.client[0]),info=record(client.client_info),android=record(info.android_client_info);
  check(android.package_name===PACKAGE,'google_services_package_mismatch');
  check(Array.isArray(client.api_key)&&client.api_key.length===1,'google_services_api_key_ambiguous');
  return validateFirebaseOptions({projectId:p.project_id,messagingSenderId:p.project_number,storageBucket:p.storage_bucket,
    appId:info.mobilesdk_app_id,authDomain:PROJECT+'.firebaseapp.com',apiKey:record(client.api_key[0]).current_key});
}
