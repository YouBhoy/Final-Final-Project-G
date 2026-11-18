import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRoot = fileURLToPath(new URL('../apps/web/', import.meta.url));
const config = loadEnv('production', webRoot, 'VITE_');
if (config.VITE_FIREBASE_PROJECT_ID !== 'spartan-g-a2d80') {
  throw new Error('Hosting build must target the main Firebase project spartan-g-a2d80. Check the website environment configuration.');
}
for (const key of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']) {
  if (!config[`VITE_FIREBASE_${key}`]) throw new Error(`Missing website Firebase configuration: ${key}.`);
}
if (!process.env.npm_execpath) throw new Error('Run this script with npm run build:web:production.');
const credential = process.env.FIREBASE_CONFIG || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credential) throw new Error('A Firebase service account or FIREBASE_CONFIG is required to build the public resource snapshot.');
if (!getApps().length) initializeApp();
const firestore = getFirestore();
const snapshot = await firestore.collection('resources')
  .where('isActive', '==', true)
  .where('audience', 'in', ['all', 'students'])
  .get();

const items = snapshot.docs.map(document => {
  const data = document.data();
  const updated = data.updatedAt?.toDate?.() ?? data.createdAt?.toDate?.();
  return {
    id: document.id,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    category: typeof data.category === 'string' ? data.category : 'other',
    tags: Array.isArray(data.tags) ? data.tags.filter(tag => typeof tag === 'string') : [],
    url: typeof data.url === 'string' ? data.url : null,
    fileUrl: typeof data.fileUrl === 'string' ? data.fileUrl : null,
    updatedAt: updated instanceof Date ? updated.toISOString() : new Date().toISOString(),
  };
}).filter(item => item.title.trim());

if (!items.length) throw new Error('Public resource snapshot aborted: Firestore returned no publishable resources.');
const publicRoot = fileURLToPath(new URL('../apps/web/public/', import.meta.url));
await mkdir(publicRoot, { recursive: true });
await writeFile(fileURLToPath(new URL('../apps/web/public/resources.json', import.meta.url)), `${JSON.stringify({
  version: 1,
  updatedAt: new Date().toISOString(),
  items,
}, null, 2)}\n`);

console.log('Building website for spartan-g-a2d80 with emulators disabled.');
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build:web'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, ...config, VITE_APP_ENV: 'production', VITE_FIREBASE_USE_EMULATORS: 'false' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
