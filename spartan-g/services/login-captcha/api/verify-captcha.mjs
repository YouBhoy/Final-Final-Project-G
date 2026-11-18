import { createCaptchaHandler } from '../server.mjs';

let handler;
const list = value => (value ?? '').split(',').map(item => item.trim()).filter(Boolean);

export default async function verifyCaptcha(req, res) {
  // Vercel parses JSON before invoking the function. Replay its parsed body
  // through the standalone handler so validation stays identical on both hosts.
  try {
    handler ??= createCaptchaHandler({
      secret: process.env.RECAPTCHA_SECRET_KEY,
      origins: list(process.env.CAPTCHA_ALLOWED_ORIGINS),
      hostnames: list(process.env.CAPTCHA_ALLOWED_HOSTNAMES),
    });
    const request = {
      url: '/verify-captcha',
      method: req.method,
      headers: req.headers,
      socket: req.socket,
      async *[Symbol.asyncIterator]() {
        const body = req.body;
        if (body !== undefined) {
          yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
        } else {
          yield* req;
        }
      },
    };
    await handler(request, res);
  } catch {
    if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ success: false }));
  }
}
