# Login reCAPTCHA on Spark

The website supports a reCAPTCHA v2 checkbox with a separate Node verification service. Firebase stays on Spark. The service receives only a CAPTCHA token, keeps the secret server-side, verifies it with Google and checks the returned hostname. Email and password continue going directly to Firebase. No Firebase Admin credentials are needed.

## Scope

This protects the website's login form only. Firebase's email/password API remains directly accessible, and a modified client can skip this form. CORS and the service's rate limit do not enforce CAPTCHA on Firebase. Registration and password reset are unchanged. For protection enforced by Firebase itself, use Identity Platform's integrated reCAPTCHA protection. Do not describe this checkbox as preventing all credential stuffing.

## Local setup

1. Create a **reCAPTCHA v2 “I'm not a robot” Checkbox** key pair in the [Google reCAPTCHA console](https://www.google.com/recaptcha/admin/create). Register `localhost` and your actual website domains. Do not use v3 keys or Google's public test keys for production.
2. Copy `services/login-captcha/config.example` to `services/login-captcha/.env`. Set the real secret key. This file is ignored by git. Never paste the secret into a `VITE_` variable, browser code, or a committed file.
3. Add the values from `apps/web/captcha-config.example` to `apps/web/.env.development.local`, replacing the public site key. Preserve existing Firebase configuration. This keeps the localhost backend URL out of production builds. Do not copy placeholder values into production.
4. Use Node 22.9 or newer. From `spartan-g`, run `npm run captcha:server` and `npm run web` in separate terminals. Alternatively, `start-system.bat` starts the verifier when its `.env` file exists. Restart Vite after changing website environment variables.
5. Sign in at `http://localhost:5173`. Confirm that the checkbox is required, incorrect passwords require a fresh challenge, and stopping the verifier blocks login even after solving the checkbox.

Without a site key or `VITE_LOGIN_CAPTCHA_ENABLED=true`, the existing login stays available. Setting either enables CAPTCHA; missing configuration, script failures, expired challenges and unavailable verification block form login. Configuration is intentionally not activated until real keys and a running verifier are supplied.

## Production setup

Deploy `services/login-captcha/server.mjs` to an external Node host with HTTPS. It uses only Node built-ins and does not require npm dependencies. Start with `node server.mjs` and supply the environment variables through the host's secret/environment settings. Set `HOST=0.0.0.0` if required by the host and use its assigned `PORT`. The separate host's charges and quotas are independent of Firebase Spark.

Set `CAPTCHA_ALLOWED_ORIGINS` to a comma-separated list of exact website origins, for example `https://spartan-g-a2d80.web.app,https://spartan-g-a2d80.firebaseapp.com`. Set `CAPTCHA_ALLOWED_HOSTNAMES` to the corresponding bare hostnames. Include your custom domain if used. Production lists should omit localhost. Wildcards are rejected.

Build the website with `VITE_LOGIN_CAPTCHA_ENABLED=true`, your public `VITE_RECAPTCHA_SITE_KEY`, and `VITE_CAPTCHA_VERIFY_URL=https://YOUR-BACKEND/verify-captcha`. The URL must use HTTPS in production. Rebuild and redeploy the website after changing these values. Firebase Hosting's existing SPA rewrite does not host this backend; point the URL at the external service.

The service limits requests to 20 per minute per socket IP within one process. Behind a reverse proxy, multiple clients may share that IP; configure per-client limits at the host's trusted edge. The service deliberately ignores user-supplied forwarding headers. Multiple replicas have separate local limits. Do not log request bodies or CAPTCHA tokens at the host.

### Vercel deployment

`services/login-captcha` also contains a Vercel function adapter. Deploy that directory as its own project using the Other framework preset; it has no install or build step. The `.vercelignore` excludes local environment files and tests. Set `RECAPTCHA_SECRET_KEY`, `CAPTCHA_ALLOWED_ORIGINS`, and `CAPTCHA_ALLOWED_HOSTNAMES` in the project's production environment before deployment. Do not set `HOST` or `PORT` for the function.

Use the stable production URL with `/verify-captcha` as the website's `VITE_CAPTCHA_VERIFY_URL`. Verify that CORS preflight succeeds from your Firebase Hosting origin and an invalid token receives HTTP 403 before deploying the website. Public visitors must be able to call this production endpoint without a Vercel login. Preview deployment URLs may have authentication protection.

Google verifies that a token is single-use and valid for two minutes: [verification reference](https://developers.google.com/recaptcha/docs/verify). The widget follows Google's [v2 integration reference](https://developers.google.com/recaptcha/docs/display).

Run `npm run test:captcha` for automated rejection and failure tests. A real browser smoke test requires the configured keys and Google's service.
