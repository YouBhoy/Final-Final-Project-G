# Website AI summary configuration

Updated: October 13, 2026 (Asia/Manila).

The website uses the same assessment-summary prompt and `gemini-3.5-flash` model as the mobile `app` branch. Generation settings match mobile: temperature 0.3 and output limit 4096 tokens. Text parts are combined, truncated output ends at the last complete sentence when possible, and retryable provider failures use the existing retry path. Website caching, assignment authorization, server-owned results and the provider's default safety settings are retained.

The key is supplied to backend code, rather than bundled in browser JavaScript. The provided `EXPO_PUBLIC_GEMINI_API_KEY` from the existing local mobile environment has been configured as `GEMINI_API_KEY` in `firebase/functions/.secret.local` for local Functions emulator use. That file is Git-ignored and its key must not be committed. Production functions read `GEMINI_API_KEY` from Firebase Secret Manager; the local file does not configure that hosted secret automatically.

## Verified

- The supplied summary key was accepted by Google's API.
- A real provider call through the website backend generated a 4035-character summary from synthetic screening scores. No student data was used in that verification.
- The initial provider attempt returned a transient 503; the subsequent test through the backend's retry path succeeded.
- Three backend tests verify exact prompt compatibility with a checked-in nonsecret mobile prompt fixture, generation options, successful/truncated output and actionable provider failures.
- Website production build and backend build pass.
- Provider error logging now includes status only; credential/model failures get actionable errors instead of logging provider response bodies.

## Hosted deployment blocker

No Cloud Functions are deployed in `spartan-g-a2d80`. The supported Firebase CLI deployment dry run failed because the project must be upgraded to Blaze (pay-as-you-go) before the required Artifact Registry API can be enabled. No function was deployed and no billing account was linked or changed.

To enable the hosted summary:

1. The project owner decides whether to enable Blaze in Firebase billing settings.
2. Configure the hosted `GEMINI_API_KEY` secret using a replacement credential before production use; the supplied credentials were shared during development.
3. Validate the supported Node runtime and deploy the website backend as a coordinated release with its assignment checks, acceptance/definition functions, rules and indexes.
4. Verify the website using an assigned facilitator and a submitted test assessment, including cache reuse and regeneration.

A separate local development backend is an alternative if the team does not want to enable Firebase billing yet. The ignored secret file prepares emulator configuration, but the current website still calls the hosted endpoint by default; running `start-system.bat` alone does not start a backend emulator or enable hosted generation.

## Tests

From `spartan-g`:

```powershell
npm.cmd --prefix firebase/functions run build
npm.cmd --prefix firebase/functions run test:summary
npm.cmd run build:web
```

The provider verification was a controlled one-time check. Automated tests use synthetic credentials and mocked HTTP responses so CI does not expose keys or incur AI charges.
