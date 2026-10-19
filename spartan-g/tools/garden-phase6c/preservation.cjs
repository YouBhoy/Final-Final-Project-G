// Read-only preservation inventory. New Phase 6C evidence is the only excluded work.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const docs = path.join(root, 'docs/garden-phase6c');
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
  return files.filter(p => !p.startsWith('docs/garden-phase6c/') && !p.startsWith('tools/garden-phase6c/') && fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile()).map(p => ({ path: p, sha256: digest(path.join(root, p)) }));
};
const checkpointDirectories = ['spartan-g-backup-before-sdk54', 'spartan-g-backup-after-copilot', 'spartan-g-backup-phase4-20261015'];
function backupInventory() {
  const backups = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Backup symlink requires review');
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) backups.push({ path: path.relative(root, file), sha256: digest(file) });
    }
  }
  for (const dir of checkpointDirectories) walk(path.resolve(root, '..', dir));
  return backups;
}
fs.mkdirSync(docs, { recursive: true });
const filename = path.join(docs, 'preservation-before.json');
if (process.argv.includes('--capture')) {
  const backups = backupInventory();
  const entries = inventory();
  fs.writeFileSync(filename, JSON.stringify({ at: new Date().toISOString(), entries, backups }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ files: entries.length, backupFiles: backups.length }));
} else {
  const before = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const different = list => list.filter(e => !fs.existsSync(path.resolve(root, e.path)) || digest(path.resolve(root, e.path)) !== e.sha256).map(e => e.path);
  const changed = different(before.entries);
  const currentBackups = backupInventory();
  const currentBackupHashes = new Map(currentBackups.map(e => [e.path, e.sha256]));
  const backupChanges = before.backups.filter(e => currentBackupHashes.get(e.path) !== e.sha256).map(e => e.path);
  const originalBackupPaths = new Set(before.backups.map(e => e.path));
  const addedBackupFiles = currentBackups.filter(e => !originalBackupPaths.has(e.path)).map(e => e.path);
  const current = inventory();
  const addedOutsidePhase6c = current.filter(e => !before.entries.some(old => old.path === e.path)).map(e => e.path);
  const allowedChanges = new Set(['functions/src/garden-rewards/runtime.ts', 'functions/src/garden-rewards/processor.ts',
    'functions/src/garden-watering/processor.ts', 'functions/src/garden-production/functions.ts', 'functions/src/garden-production/runtime.ts']);
  const allowedAdditions = new Set(['functions/src/garden-production/audit.ts', 'functions/src/garden-production/rollout.ts',
    'functions/src/garden-production/safety.ts', 'functions/src/local-garden-safety.ts', 'functions/tests/garden-safety.test.cjs']);
  const unexpectedChanges = changed.filter(name => !allowedChanges.has(name));
  const unexpectedAdditions = addedOutsidePhase6c.filter(name => !allowedAdditions.has(name));
  const result = { at: new Date().toISOString(), originalCaptureAt: before.at,
    existingFiles: before.entries.length, backupFiles: before.backups.length,
    backupFilesNow: currentBackups.length, checkpointDirectories,
    changed, backupChanges, addedBackupFiles, addedOutsidePhase6c, unexpectedChanges, unexpectedAdditions,
    coverage: 'Original non-ignored project inventory plus explicit mobile .env files; complete checkpoint file trees. Ignored generated files/node_modules and parent IDE files are outside the original project inventory.' };
  fs.writeFileSync(path.join(docs, 'preservation-after.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (unexpectedChanges.length || backupChanges.length || addedBackupFiles.length || unexpectedAdditions.length) process.exitCode = 1;
}
