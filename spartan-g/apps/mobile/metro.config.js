const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const { gardenResolution } = require('./garden-module-resolver.cjs');
const { aiResolution, readAiMode } = require('./ai-module-resolver.cjs');
const aiMode = readAiMode(process.env.SPARTAN_AI_MODE);
const previousResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = previousResolver
    ? previousResolver(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
  return aiResolution(
    gardenResolution(resolution, context, platform, process.env.EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE),
    context, platform, aiMode,
  );
};
config.cacheVersion = `spartan-garden-ai-separated-v4-${aiMode}`;
if (process.env.EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE === '1') {
  const { FileStore } = require('metro-cache');
  const path = require('node:path');
  const os = require('node:os');
  config.cacheVersion = `spartan-local-garden-ai-separated-v4-${aiMode}`;
  config.cacheStores = [new FileStore({ root: path.join(os.tmpdir(), 'spartan-local-garden-metro-cache') })];
}
module.exports = config;
