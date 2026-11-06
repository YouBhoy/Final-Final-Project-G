import type { EnvConfig } from '../../../packages/shared-services/src/config/env.shared';
import { resolveDeploymentTarget } from '../../../packages/shared-services/src/config/env.shared';
import { PROFILE, validateFirebaseOptions } from './contract';
if(process.env.EXPO_PUBLIC_SPARTAN_ANDROID_PROFILE!==PROFILE)throw Error('staging_profile_not_selected');
if(process.env.EXPO_PUBLIC_ASSESSMENT_FINALIZER_ENABLED!=='false')throw Error('staging_submission_must_remain_disabled');
// One validated public object; no dotenv, VITE, default project, emulator or production fallback.
const firebase=validateFirebaseOptions(JSON.parse(process.env.EXPO_PUBLIC_SPARTAN_STAGING_FIREBASE_CONFIG??''));
export const env:EnvConfig={appEnv:'staging',isDev:false,isProd:false,firebase,eas:{projectId:undefined}};
export { resolveDeploymentTarget };
