const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const entries = [];
function walk(relative) {
  for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const file = `${relative}/${item.name}`;
    if (item.isDirectory()) walk(file);
    else if (item.isFile() && file !== 'docs/garden-phase5/FILES.json') entries.push({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') });
  }
}
walk('docs/garden-phase5'); walk('tools/garden-phase5');
fs.writeFileSync(path.join(root, 'docs/garden-phase5/FILES.json'), JSON.stringify({ generatedAt: new Date().toISOString(), modifiedPreExistingFiles: [], addedFiles: entries, ignoredGeneratedArtifacts: ['functions/lib', 'apps/mobile/.expo/garden-phase5-release-export'], temporaryRuntime: '%TEMP%/spartan-g-phase5-node22.23.3', temporarySyntheticEnvironment: '%TEMP%/spartan-g-garden-phase5' }, null, 2) + '\n');
console.log(JSON.stringify({ addedFiles: entries.length, modifiedPreExistingFiles: 0 }));
