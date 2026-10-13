/** Apply only the Statistics admin conversation-read change to a downloaded live snapshot. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = new URL('../.firebase/statistics-rules/', import.meta.url);
const original = await readFile(new URL('firestore.rules', directory), 'utf8');
if (!/function isSuperAdmin\(\)\s*\{\s*return isActiveUser\(\) && userRole\(\) == 'super_admin';/.test(original)) throw new Error('Expected active-super-admin helper is missing; review live rules before proceeding.');
const start = original.indexOf('match /conversations/{conversationId}');
const end = original.indexOf('match /messages/{messageId}', start);
if (start < 0 || end < start) throw new Error('Expected conversation rules not found.');
const block = original.slice(start, end);
const marker = 'allow read: if isActiveUser()';
if (block.split(marker).length !== 2) throw new Error('Ambiguous conversation read rule.');
const updated = original.slice(0, start) + block.replace(marker, 'allow read: if isSuperAdmin() || isActiveUser()') + original.slice(end);
await writeFile(new URL('firestore.statistics.rules', directory), updated);
await writeFile(new URL('statistics-release.json', directory), JSON.stringify({
  firestore: { rules: 'firestore.statistics.rules' },
  emulators: { firestore: { port: 8180 }, ui: { enabled: false }, singleProjectMode: true },
}, null, 2));
const digest = text => createHash('sha256').update(text).digest('hex');
console.log(JSON.stringify({ baselineSha256: digest(original), releaseSha256: digest(updated), changes: 'Active super admins may read conversations; all other live rules preserved.' }));
