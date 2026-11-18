import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export function createCaptchaHandler({ secret, origins, hostnames, fetchImpl = fetch, now = Date.now }) {
  if (!secret || !origins?.length || !hostnames?.length || origins.includes('*') || hostnames.includes('*')) {
    throw new Error('Set RECAPTCHA_SECRET_KEY, CAPTCHA_ALLOWED_ORIGINS and CAPTCHA_ALLOWED_HOSTNAMES. Wildcards are not allowed.');
  }
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw new Error('Allowed origins must be HTTPS origins (HTTP is allowed for localhost only).');
    }
  }
  const attempts = new Map();
  return async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    res.setHeader('Vary', 'Origin');
    if (!origins.includes(req.headers.origin)) return reply(403, { success: false });
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    if (req.url !== '/verify-captcha') return reply(404, { success: false });
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return reply(405, { success: false });
    }
    const time = now();
    for (const [ip, entry] of attempts) if (entry.until <= time) attempts.delete(ip);
    // Do not trust X-Forwarded-For supplied by arbitrary clients.
    const ip = req.socket.remoteAddress;
    const attempt = attempts.get(ip) ?? { count: 0, until: time + 60000 };
    if (attempt.count >= 20 || (!attempts.has(ip) && attempts.size >= 10000)) {
      res.setHeader('Retry-After', '60');
      return reply(429, { success: false });
    }
    attempt.count++;
    attempts.set(ip, attempt);
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return reply(415, { success: false });
    let token;
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 16384) { reply(413, { success: false }); return; }
        chunks.push(chunk);
      }
      ({ token } = JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      return reply(400, { success: false });
    }
    if (typeof token !== 'string' || !token.trim() || token.length > 8192) return reply(400, { success: false });
    try {
      const verification = await fetchImpl('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(8000),
      });
      if (!verification.ok) return reply(503, { success: false });
      const result = await verification.json();
      // Google rejects expired and already-used tokens; also pin the website hostname.
      if (result.success !== true || !hostnames.includes(result.hostname)) return reply(403, { success: false });
      return reply(200, { success: true });
    } catch {
      return reply(503, { success: false });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const list = value => (value ?? '').split(',').map(item => item.trim()).filter(Boolean);
  const handler = createCaptchaHandler({
    secret: process.env.RECAPTCHA_SECRET_KEY,
    origins: list(process.env.CAPTCHA_ALLOWED_ORIGINS),
    hostnames: list(process.env.CAPTCHA_ALLOWED_HOSTNAMES),
  });
  const server = createServer((req, res) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ success: false }));
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => {
    console.log('Login CAPTCHA verification service is ready.');
  });
}
