// Read-only preservation inventory. New Phase 5 evidence is the only excluded work.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/garden-phase5');
const digest = file => {
  const h = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(file, 'r');
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) h.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return h.digest('hex');
};
const inventory = () => {
  const files = cp.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const file of ['apps/mobile/.env', 'apps/mobile/.env.local']) if (fs.existsSync(path.join(root, file)) && !files.includes(file)) files.push(file);
  return files.filter(p => !p.startsWith('docs/garden-phase5/') && !p.startsWith('tools/garden-phase5/') && fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile()).map(p => ({ path: p, sha256: digest(path.join(root, p)) }));
};
fs.mkdirSync(docs, { recursive: true });
const filename = path.join(docs, 'preservation-before.json');
if (process.argv.includes('--capture')) {
  const backups = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Backup symlink requires review');
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) backups.push({ path: path.relative(root, file), sha256: digest(file) });
    }
  }
  for (const dir of ['spartan-g-backup-before-sdk54', 'spartan-g-backup-after-copilot', 'spartan-g-backup-phase4-20261015']) walk(path.resolve(root, '..', dir));
  const entries = inventory();
  fs.writeFileSync(filename, JSON.stringify({ at: new Date().toISOString(), entries, backups }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ files: entries.length, backupFiles: backups.length }));
} else {
  const before = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const different = list => list.filter(e => !fs.existsSync(path.resolve(root, e.path)) || digest(path.resolve(root, e.path)) !== e.sha256).map(e => e.path);
  const changed = different(before.entries), backupChanges = different(before.backups);
  const current = inventory();
  const addedOutsidePhase5 = current.filter(e => !before.entries.some(old => old.path === e.path)).map(e => e.path);
  const result = { at: new Date().toISOString(), existingFiles: before.entries.length, backupFiles: before.backups.length, changed, backupChanges, addedOutsidePhase5 };
  fs.writeFileSync(path.join(docs, 'preservation-after.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (changed.length || backupChanges.length || addedOutsidePhase5.length) process.exitCode = 1;
}
