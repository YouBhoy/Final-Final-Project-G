# Security fixes changelog

October 13, 2026 (Asia/Manila). Local source changes only; no deployment, schema migration, credential change or production data modification.

## Modified source/configuration files

- `E:\Finalt-Project-G\spartan-g\firebase\firestore.rules`: SEC-001 requires existing conversation membership, bounded string body and server timestamps on message creation. SEC-007 separates token creation/update and preserves existing ownership, requiring active accounts. SEC-008 preserves facilitator identity on schedule edits. These move checks to the authoritative rules boundary. Normal shared-client writes satisfy the conditions; direct callers using missing/client timestamps or ownership transfers are intentionally rejected. Rules do not yet provide a full message/token/schedule schema or generation rate limits.
- `E:\Finalt-Project-G\spartan-g\firebase\storage.rules`: SEC-002 gates attachments by conversation membership with explicit administrator reads/deletes; facilitator delete now requires membership. SEC-010 changes Storage owner checks to require an active account. Existing object paths stay intact. Unrelated access and inactive-owner operations are intentionally denied. Long-lived download tokens and live cross-service IAM remain unverified; assignment/resource privacy and Firestore inactive-owner access remain open.
- `E:\Finalt-Project-G\spartan-g\firebase.json`: SEC-012 adds global framing, MIME-sniffing, referrer and limited CSP protections. Framing the portal is intentionally blocked. Full script/connect CSP remains a separate origin-inventory task. Live headers are not verified.

## Added verification files

- `E:\Finalt-Project-G\spartan-g\firebase.security-test.json`: isolated Firestore/Storage rules configuration on loopback ports 8184/9198. Uses production source rules and a demo project in documented commands; never deploy this configuration as a substitute for reviewing the release config.
- `E:\Finalt-Project-G\spartan-g\firebase\functions\test\securityRules.test.mjs`: four patch regressions (including Storage deactivation) and five explicitly labeled residual-gap reproductions. Guards require loopback emulators and use a fixed demo project. Synthetic records only.
- `E:\Finalt-Project-G\spartan-g\firebase\functions\test\securityHeaders.test.mjs`: static regression for all four global browser headers/directives.

## Audit artifacts

All requested reports/checklists and sanitized evidence are under `E:\Finalt-Project-G\security_audit`. `remediation/collect-evidence.mjs` inventories local tracked source and emits credential indicators without secret values. `remediation/write-reports.mjs` reproduces the findings/risk/remediation/assessment/index reports from embedded reviewed findings; it does not execute tests or mark newly edited code verified. Rerun tests and revise findings when source changes.

## Tests and limitations

Functions build and web production compilation passed. Both isolated emulator runs passed (34 and 55 tests, overlapping); 29 client/shared checks, 38 offline Functions checks and one static header check passed. Workspace typecheck failed in unchanged mobile/shared-UI files. Initial emulator-dependent tests invoked offline failed their safety guards, then passed in the emulator. Fresh npm audits failed network requests; dependencies were not upgraded. See PATCH_VERIFICATION.md for exact commands and outcomes.

These changes do not fix appointment privacy, client-controlled risk, notification provenance, legacy slot validation, assignment/resource file privacy, complete deactivation, historical dependency advisories or operational key exposure. Production protections change only after a separately reviewed authorized deployment.
