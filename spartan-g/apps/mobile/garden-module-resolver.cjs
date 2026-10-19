// Build graph separation. A runtime flag cannot remove already collected modules.
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const key = file => path.relative(root, file).replace(/\\/g, '/');
const file = relative => ({ type: 'sourceFile', filePath: path.join(root, relative) });
function gardenResolution(resolution, context, platform, optIn) {
  if (![undefined, '', '0', '1'].includes(optIn)) throw new Error('Unsupported local Firebase build setting.');
  if (optIn === '1' && (context.dev === undefined || (context.dev === true && platform !== 'android'))) {
    throw new Error('Local Firebase requires a recognized Android development build.');
  }
  if (resolution.type !== 'sourceFile') return resolution;
  const name = key(resolution.filePath);
  const local = context.dev === true && platform === 'android' && optIn === '1';
  const variants = {
    'apps/mobile/src/garden/GardenBackendBoundary.tsx': 'apps/mobile/src/garden/GardenBackendBoundary.local.tsx',
    'apps/mobile/src/garden/GardenRewardStatus.tsx': 'apps/mobile/src/garden/GardenRewardStatus.local.tsx',
    'packages/shared-services/src/services/garden-backend.ts': 'packages/shared-services/src/services/garden-backend.local.ts',
  };
  if (local) return variants[name] ? file(variants[name]) : resolution;
  if (platform === 'android') {
    const spark = {
      'apps/mobile/src/garden/GardenBackendBoundary.tsx': 'apps/mobile/src/garden/GardenBackendBoundary.spark.tsx',
      'packages/shared-services/src/services/garden-backend.ts': 'packages/shared-services/src/services/garden-backend.spark.ts',
      'packages/shared-services/src/config/garden-capabilities.ts': 'packages/shared-services/src/config/garden-capabilities.spark.ts',
    };
    if (spark[name]) return file(spark[name]);
    if (name === 'apps/mobile/src/garden/productionGardenBackend.ts'
        || name === 'apps/mobile/src/garden/externalGardenBackend.ts') {
      throw new Error('Garden backend adapters are excluded from this Android Spark build.');
    }
  }
  if (/^packages\/shared-services\/src\/config\/local-emulators(?:\.native)?\.ts$/.test(name)) {
    return file('packages/shared-services/src/config/local-emulators.disabled.ts');
  }
  if (name === 'packages/shared-services/src/config/env.native.ts') {
    return file('packages/shared-services/src/config/env.normal.native.ts');
  }
  if (name === 'packages/shared-services/src/firebase/local-emulator-state.ts') {
    return file('packages/shared-services/src/firebase/local-emulator-state.disabled.ts');
  }
  if (name.startsWith('apps/mobile/src/development/')
      || name === 'packages/shared-services/src/config/local-emulator-contract.ts'
      || name === 'packages/shared-services/src/config/local-emulators.native.ts'
      || name === 'packages/shared-services/src/services/local-garden-operations.ts'
      || Object.values(variants).includes(name)) {
    throw new Error(`Development Garden module excluded from this build: ${name}`);
  }
  return resolution;
}
module.exports = { gardenResolution };
