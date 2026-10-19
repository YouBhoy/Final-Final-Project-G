// Direct-key Gemini clients are development-only. AI Logic has a separate dormant route.
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function readAiMode(value) {
  if (value === undefined || value === '') return 'disabled';
  if (!['disabled', 'development-only', 'firebase-ai-logic'].includes(value)) {
    throw new Error('Unsupported AI build mode. Use disabled, development-only or firebase-ai-logic.');
  }
  return value;
}
function aiResolution(resolution, context, platform, setting) {
  const mode = readAiMode(setting);
  if (mode === 'firebase-ai-logic' && (platform !== 'android' || typeof context.dev !== 'boolean')) {
    throw new Error('AI Logic routing requires a recognized Android build.');
  }
  const development = context.dev === true && mode === 'development-only';
  if (context.dev === undefined && mode === 'development-only') {
    throw new Error('AI development mode requires a recognized Metro development build.');
  }
  if (resolution.type !== 'sourceFile' && resolution.type !== 'assetFiles') return resolution;
  const paths = resolution.type === 'sourceFile' ? [resolution.filePath] : resolution.filePaths;
  if (!development && paths.some(p => /(?:^|\/)\.env(?:\.[^/]*)?$/.test(path.relative(root, p).replace(/\\/g, '/')))) {
    throw new Error('Local environment files cannot be included in this build.');
  }
  if (resolution.type !== 'sourceFile') return resolution;
  const relative = path.relative(root, resolution.filePath).replace(/\\/g, '/');
  if (development) {
    const clients = {
      'packages/shared-services/src/services/gemini.ts': 'packages/shared-services/src/services/gemini.service.ts',
      'packages/shared-services/src/services/gemini.native.ts': 'packages/shared-services/src/services/gemini.service.ts',
      'packages/shared-services/src/config/ai-capabilities.native.ts': 'packages/shared-services/src/config/ai-capabilities.ts',
    };
    return clients[relative] ? { type: 'sourceFile', filePath: path.join(root, clients[relative]) } : resolution;
  }
  if (mode === 'firebase-ai-logic') {
    const clients = {
      'packages/shared-services/src/services/gemini.ts': 'packages/shared-services/src/services/gemini.native.ts',
      'packages/shared-services/src/config/ai-capabilities.ts': 'packages/shared-services/src/config/ai-capabilities.native.ts',
      // No fallback to direct Gemini or key-bearing capability/environment readers.
      'packages/shared-services/src/services/gemini.service.ts': 'packages/shared-services/src/services/gemini.disabled.ts',
    };
    return clients[relative] ? { type: 'sourceFile', filePath: path.join(root, clients[relative]) } : resolution;
  }
  const replacements = {
    'packages/shared-services/src/services/gemini.ts': 'packages/shared-services/src/services/gemini.disabled.ts',
    'packages/shared-services/src/services/gemini.native.ts': 'packages/shared-services/src/services/gemini.disabled.ts',
    'packages/shared-services/src/services/gemini.service.ts': 'packages/shared-services/src/services/gemini.disabled.ts',
    'packages/shared-services/src/config/ai-capabilities.ts': 'packages/shared-services/src/config/ai-capabilities.disabled.ts',
    'packages/shared-services/src/config/ai-capabilities.native.ts': 'packages/shared-services/src/config/ai-capabilities.disabled.ts',
  };
  return replacements[relative]
    ? { type: 'sourceFile', filePath: path.join(root, replacements[relative]) }
    : resolution;
}
module.exports = { aiResolution, readAiMode };
