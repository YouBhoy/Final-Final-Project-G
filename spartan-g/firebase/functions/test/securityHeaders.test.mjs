import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('release hosting config applies browser security headers to all paths', () => {
  const config = JSON.parse(readFileSync(new URL('../../../firebase.json',import.meta.url),'utf8'));
  const headers = Object.fromEntries(config.hosting.headers.find(rule => rule.source === '**').headers.map(header => [header.key,header.value]));
  assert.equal(headers['X-Content-Type-Options'],'nosniff');
  assert.equal(headers['X-Frame-Options'],'DENY');
  assert.equal(headers['Referrer-Policy'],'strict-origin-when-cross-origin');
  for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) assert.ok(headers['Content-Security-Policy'].includes(directive));
});
