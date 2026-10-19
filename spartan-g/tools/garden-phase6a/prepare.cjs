const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
fs.mkdirSync(path.join(root, 'docs/garden-phase6a'), { recursive: true });
function copy(from, to, change = s => s) {
  fs.writeFileSync(path.join(root, to), change(fs.readFileSync(path.join(root, from), 'utf8')), { flag: 'wx' });
}
copy('tools/garden-phase5/preservation.cjs', 'tools/garden-phase6a/preservation.cjs', s => s.replaceAll('garden-phase5', 'garden-phase6a'));
copy('tools/garden-phase5/regressions.cjs', 'tools/garden-phase6a/regressions.cjs', s => s.replaceAll('docs/garden-phase5', 'docs/garden-phase6a'));
copy('tools/garden-phase5/start.cjs', 'tools/garden-phase6a/start.cjs', s => s.replaceAll('garden-phase5', 'garden-phase6a'));
copy('tools/garden-phase5/platform.test.cjs', 'tools/garden-phase6a/platform.test.cjs', s => s.replaceAll('garden-phase5', 'garden-phase6a'));
copy('tools/garden-phase5/firebase.json', 'tools/garden-phase6a/firebase.json');
copy('tools/garden-mobile-phase4/client.test.cjs', 'tools/garden-phase6a/client.test.cjs');
copy('tools/garden-mobile-phase4/cleanup.test.cjs', 'tools/garden-phase6a/cleanup.test.cjs');
// Inert source only: no runnable Phase 6A device cleanup command is created.
fs.mkdirSync(path.join(__dirname, 'fixtures'), { recursive: true });
copy('tools/garden-mobile-phase4/stop.cjs', 'tools/garden-phase6a/fixtures/phase4-stop.source.txt', s => '// Inert source fixture for mocked cleanup tests. Never execute against a device.\n' + s);
console.log('Phase 6A isolated tooling prepared; prior evidence unchanged.');
