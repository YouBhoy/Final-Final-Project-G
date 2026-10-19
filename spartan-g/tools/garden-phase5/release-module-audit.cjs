// Evaluate only two pure configuration modules from the actual minified artifact.
// Never evaluate the app bundle or any Firebase client/provider module.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const docs = path.resolve(__dirname, '../../docs/garden-phase5');
const artifact = JSON.parse(fs.readFileSync(path.join(docs, 'release-artifact-audit-project.json'), 'utf8'));
assert.equal(artifact.status, 0);
const source = fs.readFileSync(path.join(artifact.output, artifact.artifacts[0].file), 'utf8');
function definition(predicate) {
  const lines = source.split('\n').filter(line => line.startsWith('__d(') && predicate(line));
  assert.equal(lines.length, 1);
  let value;
  vm.runInNewContext(lines[0], { __d: (fn, id, deps) => { value = { fn, id, deps }; } }, { timeout: 1000 });
  return value;
}
const contract = definition(line => line.includes('e.buildLocalEmulatorConfig=function'));
const config = definition(line => line.includes('e.localEmulators=(0,') && line.includes('buildLocalEmulatorConfig'));
assert.equal(contract.deps.length, 0);
assert.equal(config.deps.length, 1);
assert.equal(config.deps[0], contract.id);
const exported = {};
contract.fn(undefined, () => { throw new Error('Unexpected import'); }, undefined, undefined, { exports: exported }, exported, []);
const actual = {};
config.fn(undefined, id => { assert.equal(id, contract.id); return exported; }, undefined, undefined, { exports: actual }, actual, config.deps);
assert.equal(actual.localEmulators.enabled, false);
assert.equal(Object.keys(actual.localEmulators).length, 1);
assert.throws(() => exported.buildLocalEmulatorConfig('1', false), /development build/);
const report = { checkedAt: new Date().toISOString(), artifactSha256: artifact.artifacts[0].sha256, evaluatedModulesOnly: ['pure local emulator contract', 'compiled release local configuration'], compiledOptIn: '0', compiledDevBuild: false, result: { enabled: actual.localEmulators.enabled }, releaseOptInOneRejected: true, appExecuted: false, firebaseExecuted: false, productionNetworkAccess: false, localHostAndPortsStillBundled: artifact.artifacts[0].presentStrings.includes('10.0.2.2'), strictNoEmbeddedLocalEndpointsPassed: false };
fs.writeFileSync(path.join(docs, 'release-module-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
