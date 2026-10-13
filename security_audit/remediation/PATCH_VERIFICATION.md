# Patch verification

Date: 2026-10-13 (Asia/Manila). Tests ran locally using Node 24.15.0, npm 11.12.1, TypeScript 5.3.3, Firebase CLI 15.22.3, Java 25.0.3, Firestore emulator 1.21.0 and Storage rules runtime 1.1.3. Functions declares Node 20; local success does not validate that runtime.

## Environment and data safety

The default application environment can target the main Firebase project, so no launcher, seeder, Admin migration, cleanup or promotion script was run. Dynamic tests explicitly used `demo-spartan-booking`, loopback emulators and synthetic users/data. Tests create/update synthetic documents and Storage objects only. No privileged key was loaded for a live request. Emulator tests require local host variables before requests; the emulator injects them. Builds compile local code and do not deploy.

PowerShell blocked `npm.ps1`; commands used `npm.cmd` without changing execution policy. Firebase CLI preferences were isolated by setting `XDG_CONFIG_HOME` to a temporary workspace audit directory because default configstore access was denied. No escalation or auto-review rejection occurred. Temporary preference files were removed after testing. For future runs, set it to a temporary local directory you control. Set `FIREBASE_CLI_DISABLE_UPDATE_CHECK=true` as well. CLI MOTD/remote config lookup failed but emulator execution succeeded from cached runtimes.

## Applied fixes

| Finding | Patch | Method and expected result | Actual result | Status |
|---|---|---|---|---|
| SEC-001 | Authorize message creation by conversation membership and input bounds | Member writes succeed; outsider, inactive, forged, missing-conversation, oversized/non-string/empty-body and missing-time writes fail | All expected allow/deny results observed | Pass — local emulator |
| SEC-002 | Attachment access uses conversation membership | Member upload and staff download succeed; outsider download and replacement fail | All expected results observed | Pass — local emulator |
| SEC-007 | Preserve token ownership and require active writer | Own registration/refresh succeeds; takeover and disabled refresh fail | All expected results observed | Pass — local emulator |
| SEC-008 | Freeze schedule facilitatorId | Own schedule edit succeeds; identity transfer fails | All expected results observed | Pass — local emulator |
| SEC-010 | Active Storage owner required | Disabled avatar upload fails | Denied as expected; inactive Firestore profile read still succeeds | Pass for applied portion; overall partially addressed |
| SEC-012 | Four Hosting header protections | Release config applies expected values globally; web still builds | One config test and web build passed | Pass — static/config only; live delivery Not Tested |

Storage delete/admin branches and all possible message schemas were not exhaustively tested. No authenticated live headers, token-URL revocation or production rollout was checked. No issue is marked fully resolved in a deployed environment.

## Executed commands and results

Run from `E:\Finalt-Project-G\spartan-g` unless otherwise stated.

1. From `firebase\functions`: `npm.cmd run build` — **Pass**, exit 0; Functions TypeScript compiled.
2. `firebase.cmd emulators:exec --project demo-spartan-booking --config firebase.security-test.json --only firestore,storage "node --test firebase/functions/test/securityRules.test.mjs firebase/functions/test/registrationRules.test.mjs firebase/functions/test/facilitatorAccess.test.mjs firebase/functions/test/sparkAppointments.test.mjs"` — **Pass**, exit 0, 34 tests / 34 pass / 0 fail. At this invocation securityRules contained four patch tests. Preserved student-only registration, assigned staff access, privacy policy restrictions and actual Spark reservation/acceptance/concurrency behavior.
3. After adding five residual-gap tests: `firebase.cmd emulators:exec --project demo-spartan-booking --config firebase.security-test.json --only firestore,storage "node --test firebase/functions/test/securityRules.test.mjs firebase/functions/test/studentProfile.test.mjs firebase/functions/test/attemptChain.test.mjs firebase/functions/test/assessmentOverride.test.mjs firebase/functions/test/statisticsClientAccess.test.mjs"` — **Pass**, exit 0, 55 tests / 55 pass / 0 fail. Outputs were filtered from a temporary log to exclude raw process environments. Validated admin-only profiles/overrides, strict attempt chains and admin statistics access.
4. `node --test scripts/assessment-catalog.test.mjs packages/shared-types/src/utils/risk-evaluation.test.mjs packages/shared-types/src/utils/appointment-scheduling.test.mjs apps/web/test/privacyConsent.test.mjs` — **Pass**, 29 tests / 29 pass / 0 fail. Risk-evaluation tests describe test equivalents rather than full deployed server scoring verification.
5. From `firebase\functions`: `node --test test/assessmentSummary.test.mjs test/statistics.test.mjs test/statisticsClient.test.mjs test/registrationClients.test.mjs test/bookingWindow.test.mjs` — **Pass**, exit 0, 38 tests / 38 pass / 0 fail. AI requests stubbed; no provider called.
6. From `firebase\functions`: `node --test test/securityHeaders.test.mjs` — **Pass**, exit 0, 1 test / 1 pass / 0 fail.
7. `npm.cmd run build:web` — **Pass**, exit 0. Web TypeScript and Vite production compile succeeded; existing large-chunk warning remains.
8. `npm.cmd run typecheck` — **Fail**. Web/shared-services/shared-types checks passed; mobile had 16 errors (Expo listener return type, linking configuration, assessment API/type mismatches, shared env module setting); shared-UI had TS6306/TS6310 project reference errors. All affected source files were unchanged by this patch. The containing shell later ran successful tests, so its final exit 0 is not a typecheck pass.
9. Initial offline invocation from `firebase\functions`: `node --test test/assessmentSummary.test.mjs test/studentProfile.test.mjs test/statistics.test.mjs test/statisticsClient.test.mjs test/registrationClients.test.mjs test/bookingWindow.test.mjs test/attemptChain.test.mjs` — **Fail**, exit 1; 45 passed, 2 test-file failures because studentProfile and attemptChain require emulators. No live fallback occurred. Both subsequently passed in command 3; offline-only suites subsequently passed in command 5.
10. `npm.cmd audit --json --ignore-scripts` from `spartan-g` and from `spartan-g\firebase\functions` — **Not validated**, both exit 1 due advisory endpoint network failure. This is not a clean dependency audit. The root tree has historical evidence only; a fresh root audit was not attempted.
11. From repository root: `node security_audit/remediation/collect-evidence.mjs` — **Pass** after correcting historical JSON BOM parsing. 276 first-party files scanned; zero heuristic tracked-source credential indicators, two ignored local service-account files contain private-key markers. No values emitted. Git history/key validity not tested.
12. `git diff --check` — **Pass**, no whitespace errors; Git printed a normal line-ending notice for firebase.json.

These run totals overlap; they are not a count of unique tests. Existing suites were inspected for emulator guards and source behavior before invocation. Some remaining suites (including web-import smoke fixture and broader alternate rule modes) were not executed; no all-tests claim is made.

## Reproduced open gaps

Five tests deliberately expect currently insecure behavior: unrelated appointment note read (SEC-003), arbitrary submitted risk (SEC-004), outsider notification creation (SEC-005), unrelated slot identity/time mutation (SEC-006), and inactive profile read (SEC-010). Each reproduced successfully with synthetic records. Their passing status confirms an open weakness, not a secure control. After migration, invert their assertions and add positive workflow tests before declaring a fix.

## Release acceptance still required

- Review staged migrations for SEC-003/004/005/006/009/010; no schemas were changed.
- Run Functions tests under the declared Node runtime; resolve mobile/shared-UI typecheck errors and validate a mobile release/device build.
- Rerun fresh audits with registry access and classify advisory reachability.
- After separately authorized deployment, verify actual rule versions, Storage-to-Firestore permission setup, HTTP headers and download-token access. Roll back via the source diff if a legitimate workflow fails.
