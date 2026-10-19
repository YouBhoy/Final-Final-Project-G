const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const label = process.argv[2];
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Safe evidence label required.');
  const project = 'demo-spartan-g-garden-phase2';
  const origin = `http://127.0.0.1:18089/v1/projects/${project}/databases/(default)/documents`;
  const records = {};
  for (const uid of ['local-garden-existing', 'local-garden-missing', 'local-garden-other', 'local-garden-init-test']) {
    const response = await fetch(`${origin}/student_gardens/${uid}`, { headers: { Authorization: 'Bearer owner' }, signal: AbortSignal.timeout(5000) });
    if (!response.ok && response.status !== 404) throw new Error('Synthetic snapshot failed.');
    records[uid] = response.ok ? await response.json() : null;
  }
  const receipts = await fetch(`${origin}/garden_reward_receipts`, { headers: { Authorization: 'Bearer owner' }, signal: AbortSignal.timeout(5000) }).then(r => r.json());
  const evidence = { at: new Date().toISOString(), project, gardens: records, receipts };
  fs.writeFileSync(path.resolve(__dirname, `../../docs/garden-mobile-phase4/${label}.json`), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(records).map(([uid, doc]) => [uid, doc ? {
    level: doc.fields.level.integerValue, xp: doc.fields.xp.integerValue, seeds: doc.fields.seeds.integerValue,
    streak: doc.fields.streakCount.integerValue } : null]))));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
