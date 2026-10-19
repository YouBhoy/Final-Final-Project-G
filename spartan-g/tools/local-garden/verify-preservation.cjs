const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/local-garden-emulators');
const before = JSON.parse(fs.readFileSync(path.join(docs, 'preservation-before.json'), 'utf8'));
const permitted = new Set([
  'apps/mobile/src/adapters/expo-messaging.adapter.ts', 'apps/mobile/src/app/App.tsx',
  'apps/mobile/src/providers/AppProviders.tsx', 'packages/shared-services/src/config/env.native.ts',
  'packages/shared-services/src/firebase/app.ts', 'packages/shared-services/src/firebase/auth.ts',
  'packages/shared-services/src/firebase/firestore.ts',
].map(p => `spartan-g/${p}`));
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const changed = [];
for (const entry of before.entries) {
  const filename = path.join(before.repository, entry.path);
  if (!fs.existsSync(filename) || hash(filename) !== entry.sha256) changed.push(entry.path);
}
const backups = JSON.parse(fs.readFileSync(path.join(root, 'docs/sdk53-firestore-restoration/preservation-before.json'), 'utf8')).backups;
const backupChanges = Object.entries(backups).filter(([relative, digest]) => {
  const filename = path.resolve(root, relative);
  return !fs.existsSync(filename) || hash(filename) !== digest;
}).map(([relative]) => relative);
const report = { checkedAt: new Date().toISOString(), originalFilesChecked: before.entries.length,
  expectedModifiedFiles: changed.filter(p => permitted.has(p)), unexpectedModifiedFiles: changed.filter(p => !permitted.has(p)),
  backupFilesChecked: Object.keys(backups).length, backupChanges };
fs.writeFileSync(path.join(docs, 'preservation-after.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.unexpectedModifiedFiles.length || backupChanges.length) process.exitCode = 1;
