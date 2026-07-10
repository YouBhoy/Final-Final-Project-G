# Web Login/Register Regression Diagnostic Report
**Date**: 2026-07-10
**Status**: No code changes made — diagnostic only

---

## 1. Executive Summary

The web login/register failure is **NOT a Firebase Console config issue** and **NOT an env var mismatch**. Both platforms (web + mobile) share the same Firebase project correctly. The root cause is a **module-load-time crash** in `packages/shared-services` that kills the entire web app when any page imports from `@spartan-g/shared-services`.

---

## 2. How Web Auth Actually Works (Self-Contained Path)

The web's login and register pages use a **completely self-contained auth path** that does NOT use `shared-services`:

```
LoginPage.tsx → useAuth() → AuthProvider (context)
    → lib/auth.ts → imports auth from apps/web/src/firebase/firebase.ts
        → this firebase.ts reads import.meta.env.VITE_FIREBASE_* directly
```

This path is **100% within `apps/web`**. It should work fine.

## 3. The Problem: Module-Load-Time Crash in shared-services

**Even though the login page doesn't directly use shared-services, the AppRouter imports other pages that DO**, which triggers shared-services to evaluate at module load time. Here's the crash chain:

```
AppRouter.tsx loads
  → imports StudentAssessmentsPage, AssessmentWizardPage, etc.
    → these import from @spartan-g/shared-services
      → packages/shared-services/src/index.ts
        → exports * from './store' → auth.store.ts
          → imports '../config/env'  (via resolveDeploymentTarget)
        → exports * from './firebase' → app.ts
          → import { env } from '../config/env'
            → packages/shared-services/src/config/env.ts
              → re-exports from './env.web'
                → env.web.ts EVALUATES AT MODULE LOAD TIME:
                  const appEnv = getAppEnv()             // ← runs immediately
                  export const env = {                    // ← runs immediately
                    firebase: {
                      apiKey: requireEnv('EXPO_PUBLIC_...', 'VITE_FIREBASE_API_KEY'), // ← runs immediately!
                      ...
                    }
                  }
```

### The `requireEnv` function:
```typescript
function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = optionalEnv(key);
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: one of ${keys.join(', ')}`);
}
```

If ANY Firebase env var fails to resolve (returns undefined/empty), `requireEnv` **throws an unhandled exception** at **module evaluation time**, which prevents the entire module graph from loading — crashing the whole web app before it even renders the login page.

### Why could it fail?
The `optionalEnv` function checks:
```
1. typeof process !== 'undefined' ? process.env?.[key] : undefined
2. import.meta.env?.[key]
```

For Vite: `import.meta.env.VITE_*` should have the values from `.env`. BUT: `optionalEnv` first checks `process.env` — and if by any chance a Node.js process environment variable is set to an empty string for one of these keys, it would return empty string (falsy), then `import.meta.env` would also return undefined for non-VITE-prefixed keys like `EXPO_PUBLIC_FIREBASE_API_KEY`.

The order of keys in `requireEnv` is `['EXPO_PUBLIC_FIREBASE_API_KEY', 'VITE_FIREBASE_API_KEY']`. Under Vite, `EXPO_PUBLIC_FIREBASE_API_KEY` is NOT a VITE_ prefixed var, so `import.meta.env.EXPO_PUBLIC_FIREBASE_API_KEY` would be `undefined`. It falls through to `VITE_FIREBASE_API_KEY` which should be there. So this SHOULD work... unless the `.env` file was `gitignored` and is different from what we see, or Vite isn't reading it.

---

## 4. What to Check First — The Actual Error

Please reproduce the error and paste the **exact browser console error**. Key things to look for:

- Is it a **firebase/auth** error? (e.g., "auth/invalid-api-key", "auth/unauthorized-domain")
- Is it a **module load error**? (e.g., "Failed to resolve module", "env is not defined")
- Is it a **blank white page** with no errors? (suggests a React crash)

**Also check**: Does the page render at all, or does it crash immediately before rendering? If the login form never shows (endless spinner or blank page), it's a module-load crash. If the login form shows but submission fails, it's an auth API error.

---

## 5. Firebase Console Items to Verify

While I'm confident the code-level issue is the module crash, please also verify in Firebase Console (to rule out):

### Authentication → Sign-in method
- [ ] Is **Email/Password** still enabled as a sign-in provider?
- [ ] Click "Email/Password" → verify it's still set to "Enable"

### Authentication → Settings → Authorized domains
- [ ] Is `localhost` still in the authorized domains list?
- [ ] If you're using a different dev domain (e.g., 127.0.0.1, or a custom domain), is it listed?

### App Check
- [ ] Go to **App Check** in Firebase Console → is it **enabled or disabled**?
- [ ] If enabled: which providers are configured? Web requests would fail if Enforcement is on but web has no attestation set up. Mobile (with DeviceCheck/SafetyNet) might still work while web is blocked.

### Firestore Data
- [ ] Go to **Firestore Database → Data tab** → check the `users` collection
- [ ] Does the user document for your test account still have `isActive: true`?

---

## 6. Most Likely Root Cause (Hypothesis)

### Hypothesis A: Module-load crash in shared-services (CONFIDENCE: 85%)

The `env.web.ts` runs `requireEnv()` at module evaluation time. If the `env.ts` barrel file `export { env } from './env.web'` is resolved, the entire shared-services module tree fails. This would manifest as:
- **Blank white page or infinite spinner** (AppRouter fails to mount)
- Error in console like "Missing required environment variable" or "Failed to resolve module"

### Hypothesis B: Vite resolve.extensions issue (CONFIDENCE: 25%)

The `vite.config.ts` has `extensions: ['.web.ts', '.web.tsx', '.ts', '.tsx', '.js', '.jsx']`. If `env.ts` imports `'./env.web'` and Vite also looks for `./env.web.web.ts`, it could resolve incorrectly. (Low confidence — tested behavior is usually fine.)

### Hypothesis C: Firebase Console App Check was accidentally enabled (CONFIDENCE: 60%)

If someone toggled App Check enforcement in Firebase Console, web requests would be blocked while mobile (with built-in attestation) might still work. Please verify item #3 above.

---

## 7. Is This Fix Independent of the Assessment-Fix Merge?

**YES — completely independent.**

| Issue | Root cause location | Files to touch |
|-------|-------------------|----------------|
| Web login regression | `packages/shared-services/src/config/env.web.ts` (module-level env evaluation) | Config files only |
| Assessment discrepancy | `packages/shared-types/src/constants/collections.ts` + branch sync | Collection constants + merge |

The login fix is about **lazy vs eager env resolution** — making `requireEnv` not throw at module load time, or catching it gracefully. The assessment fix is about **which Firestore collection to read**. They don't overlap in code or data.

However: the assessment-fix **also touches `shared-services`** (the Phase 4.1/4.2 commits `a7e38b1` and `ad4691b` on `main`), so merging `main` might bring in other shared-services changes that could interact. Fix the login first, then merge `main` separately.

---

## 8. Recommended Immediate Action

1. **Check the browser console error** and paste it here — this will confirm or rule out Hypothesis A.
2. **Check Firebase Console App Check** — rule out Hypothesis C in 30 seconds.
3. If it's Hypothesis A (module crash), the fix is: **replace module-level `requireEnv()` calls with lazy initialization** in `shared-services/src/firebase/app.ts` so Firebase config is loaded on first use, not at import time. I can implement this without touching production data.