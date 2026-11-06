const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const { gardenResolution } = require('./garden-module-resolver.cjs');
const { aiResolution, readAiMode } = require('./ai-module-resolver.cjs');
const aiMode = readAiMode(process.env.SPARTAN_AI_MODE);
const { readProfile, stagingResolution } = require('./staging/resolver.cjs');
const androidProfile = readProfile(process.env.SPARTAN_ANDROID_PROFILE);
const presentation = require('./presentation/profile.cjs');
const presentationMode = presentation.mode(process.env.SPARTAN_PRESENTATION_PROFILE);
if (presentationMode && (androidProfile !== 'production' || aiMode !== 'disabled')) throw new Error('Presentation requires the production profile with AI disabled.');
if (androidProfile === 'staging-v25' && aiMode !== 'disabled') throw new Error('Staging AI must remain disabled.');
const previousResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = previousResolver
    ? previousResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
  return presentation.resolution(stagingResolution(
    aiResolution(gardenResolution(resolution, context, platform, process.env.EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE), context, platform, aiMode),
    context, platform, androidProfile,
  ), context, platform, process.env.SPARTAN_PRESENTATION_PROFILE);
};
config.cacheVersion = `spartan-garden-ai-separated-v4-${aiMode}`;
if (androidProfile === 'staging-v25') config.cacheVersion += '-android-staging-v25';
if (presentationMode) config.cacheVersion += '-production-presentation-v25';
if (androidProfile === 'staging-v25' || presentationMode) {
  // Expo's mobile server root must still see shared packages and hoisted modules.
  const path = require('path');
  config.watchFolders = [...new Set([...config.watchFolders,
    path.resolve(__dirname, '../../packages'), path.resolve(__dirname, '../../node_modules')])];
}
if (process.env.EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE === '1') {
  const { FileStore } = require('metro-cache');
  const path = require('node:path');
  const os = require('node:os');
  config.cacheVersion = `spartan-local-garden-ai-separated-v4-${aiMode}`;
  config.cacheStores = [new FileStore({ root: path.join(os.tmpdir(), 'spartan-local-garden-metro-cache') })];
}
module.exports = config;
