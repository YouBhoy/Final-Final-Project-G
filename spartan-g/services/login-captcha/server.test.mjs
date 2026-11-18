import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createCaptchaHandler } from './server.mjs';
import vercelHandler from './api/verify-captcha.mjs';

async function setup(t, fetchImpl) {
  const handler = createCaptchaHandler({ secret: 'test-secret', origins: ['http://localhost:5173'], hostnames: ['localhost'], fetchImpl });
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/verify-captcha`;
  return (body = { token: 'test-token' }, headers = {}, method = 'POST') => fetch(url, {
    method, headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...headers },
    ...(method === 'OPTIONS' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

test('valid token is checked server-side with secret and allowed hostname', async t => {
  const request = await setup(t, async (url, options) => {
    assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
    assert.equal(options.body.get('secret'), 'test-secret');
    assert.equal(options.body.get('response'), 'test-token');
    return Response.json({ success: true, hostname: 'localhost' });
  });
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { success: true });
});

test('missing, malformed and oversized tokens never reach Google', async t => {
  const request = await setup(t, () => { assert.fail('must not verify invalid input'); });
  for (const body of [{}, { token: '' }, { token: 123 }, { token: 'x'.repeat(8193) }, 'invalid-json']) {
    assert.equal((await request(body)).status, 400);
  }
  assert.equal((await request({ token: 'x'.repeat(17000) })).status, 413);
  assert.equal((await request({}, { 'Content-Type': 'text/plain' })).status, 415);
});

test('untrusted origins are rejected and preflight makes no upstream request', async t => {
  const request = await setup(t, () => { assert.fail('must not verify'); });
  assert.equal((await request({}, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await request({}, {}, 'OPTIONS')).status, 204);
});

test('expired, replayed, failed and wrong-host tokens are rejected', async t => {
  for (const result of [{ success: false, 'error-codes': ['timeout-or-duplicate'] }, { success: true, hostname: 'attacker.example' }, { success: 'true', hostname: 'localhost' }]) {
    const request = await setup(t, async () => Response.json(result));
    assert.equal((await request()).status, 403);
  }
});

test('upstream outages and malformed replies fail closed without exposing secrets', async t => {
  for (const fetchImpl of [async () => { throw new Error('test-secret'); }, async () => new Response('bad'), async () => new Response('', { status: 500 })]) {
    const request = await setup(t, fetchImpl);
    const response = await request();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { success: false });
  }
});

test('excessive requests are rate limited even when clients spoof forwarding headers', async t => {
  const request = await setup(t, async () => Response.json({ success: true, hostname: 'localhost' }));
  for (let i = 0; i < 20; i++) assert.equal((await request({}, { 'X-Forwarded-For': `192.0.2.${i}` })).status, 400);
  const response = await request();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
});

test('service refuses missing secrets or wildcard configuration', () => {
  for (const config of [{}, { secret: 'secret', origins: ['*'], hostnames: ['localhost'] }]) {
    assert.throws(() => createCaptchaHandler(config));
  }
});

test('Vercel adapter verifies parsed JSON, handles preflight, and rejects malformed bodies', async t => {
  const keys = ['RECAPTCHA_SECRET_KEY', 'CAPTCHA_ALLOWED_ORIGINS', 'CAPTCHA_ALLOWED_HOSTNAMES'];
  const previous = keys.map(key => process.env[key]);
  const previousFetch = globalThis.fetch;
  t.after(() => {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    globalThis.fetch = previousFetch;
  });
  process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
  process.env.CAPTCHA_ALLOWED_ORIGINS = 'https://spartan-g-a2d80.web.app';
  process.env.CAPTCHA_ALLOWED_HOSTNAMES = 'spartan-g-a2d80.web.app';
  let verifications = 0;
  globalThis.fetch = async (url, options) => {
    verifications++;
    assert.equal(options.body.get('secret'), 'test-secret');
    assert.equal(options.body.get('response'), 'test-token');
    return Response.json({ success: true, hostname: 'spartan-g-a2d80.web.app' });
  };
  async function request(body, method = 'POST') {
    const result = { headers: {} };
    await vercelHandler({ method, body, headers: { origin: 'https://spartan-g-a2d80.web.app', 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' } }, {
      setHeader(key, value) { result.headers[key] = value; },
      writeHead(status) { result.status = status; },
      end(data) { result.body = data; },
    });
    return result;
  }
  const valid = await request({ token: 'test-token' });
  assert.equal(valid.status, 200);
  assert.deepEqual(JSON.parse(valid.body), { success: true });
  assert.equal((await request(undefined, 'OPTIONS')).status, 204);
  assert.equal((await request('bad-json')).status, 400);
  assert.equal((await request({})).status, 400);
  assert.equal(verifications, 1);
});
