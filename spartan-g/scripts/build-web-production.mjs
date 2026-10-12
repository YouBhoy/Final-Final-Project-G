import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

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
console.log('Building website for spartan-g-a2d80 with emulators disabled.');
const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build:web'], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, ...config, VITE_APP_ENV: 'production', VITE_FIREBASE_USE_EMULATORS: 'false' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
