// Copy unchanged suites; redirect only evidence/TEMP paths into this phase.
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../garden-mobile-phase4');
function copy(name, rewrite = s => s) {
  const contents = rewrite(fs.readFileSync(path.join(source, name), 'utf8'));
  fs.writeFileSync(path.join(__dirname, name), contents, { flag: 'wx' });
}
copy('regressions.cjs', s => s.replace("docs/garden-mobile-phase4", "docs/garden-phase5"));
copy('platform.test.cjs', s => s.replaceAll('spartan-g-garden-mobile-phase4', 'spartan-g-garden-phase5').replaceAll('docs/garden-mobile-phase4', 'docs/garden-phase5'));
copy('firebase.json');
copy('start.cjs', s => s.replace("const hostOnly = process.argv.includes('--host-only');", "const hostOnly = process.argv.includes('--host-only');\nif (!hostOnly) throw new Error('Phase 5 permits host-only testing; no Android, firewall or Metro control.');")
  .replaceAll('spartan-g-garden-mobile-phase4', 'spartan-g-garden-phase5')
  .replaceAll('docs/garden-mobile-phase4', 'docs/garden-phase5')
  .replace("const firewall = require('./device-firewall.cjs');", "const firewall = null; // Host-only mode never calls device functions.")
  .replace("console.log('Local environment stopped. App is stopped; the per-app firewall remains until explicitly disabled.');", "console.log('Phase 5 host environment stopped; Android and firewall were not touched.');"));
console.log('Copied existing suites to Phase 5; previous evidence preserved.');
