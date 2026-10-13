# Security assessment report

**Date:** October 13, 2026 (Asia/Manila)
**Workspace:** E:\Finalt-Project-G
**Baseline:** 7e671a3119f8fe547ea32b8dff539c72fb60b538

## 1. Executive summary

Ten confirmed source-level vulnerabilities, two potential risks and two hardening items were recorded. Four confirmed vulnerabilities were patched and verified locally; deactivation was partially addressed. One browser-header hardening item was implemented and statically verified. Six confirmed vulnerabilities remain open, including the partially addressed item. No live deployment was performed. The priority is protecting private appointment/assignment files and making assessment risk/alerts authoritative.

Across all 14 items: 0 Critical, 7 High, 6 Medium, 1 Low. Confirmed vulnerabilities alone: 0 Critical, 5 High, 5 Medium, 0 Low. Two High potential items concern dependencies and local privileged credentials. Hardening items are one Medium and one Low. Counts describe findings, not independent npm advisory counts.

## 2. Assessment objectives

Identify evidence-based security weaknesses, prioritize remediation, apply safe targeted fixes, preserve workflows and provide reproducible non-destructive checks.

## 3. Scope of assessment

First-party web/mobile clients, shared services/types/UI, Firestore/Storage rules, exported and retired Functions, package manifests/lockfiles, maintenance/migration scripts, build/launch configuration and existing tests/docs. Inventory contained 9627 tracked files including 9297 tracked root dependency files; heuristic secret scan covered 276 first-party source/config files. Final-Final-Project-G contains a README only. Generated dependencies/builds and pasted historical context were not treated as authoritative application source. No AGENTS.md was found in the project inventory. Review was risk-based, not a claim of manual review of every line.

## 4. System architecture overview

React 18.3.1 / TypeScript / Vite 5.4.21 web app; Expo 52 / React Native 0.76.5 mobile app; npm workspaces with shared services, types and UI. Declared Functions runtime is Node 20 with Firebase Admin 12.x and Functions 5.x; local audit ran Node 24.15.0, so deployment runtime parity remains unverified. Exact lockfile versions are in evidence/local-assessment.json.

Firebase Auth issues sessions; Firestore users.role/isActive controls active student, facilitator and super_admin permissions. Facilitator-student accepted links restrict sensitive staff access. Clients access Firestore/Storage directly, so Firebase rules are the security boundary; route and service checks are secondary. Admin callables recheck active roles; AI summaries also verify student assignment. Spark appointments use atomic four-block reservation records, with a migration gate. Trusted scripts use Admin SDK credentials and bypass rules. Exported Functions cover admin profile/password/name, attempt overrides, published definitions, AI summaries and message notifications; retired appointment handlers are not exported.

Sensitive flows include screening answers/risk → Firestore → assigned staff; summary scores → fixed Google Gemini HTTPS endpoint → private summary cache; conversation text → Firestore → FCM push previews/device tokens; files → Storage → download URLs; appointments → availability queries. Google Fonts and YouTube embeds add third-party browser requests. Gemini uses a Secret Manager reference rather than a client key. No arbitrary user-selected server fetch target was found in the reviewed callables.

Main attack surfaces are public Auth signup/reset, authenticated Firestore/Storage SDK/REST access, callable Functions, Firestore-triggered push, hosted SPA, local development servers and privileged maintenance scripts.

## 5. Security testing methodology

OWASP Top 10:2025 themes and ASVS authentication, access control, validation, configuration, data protection and logging areas guided review; this is not an ASVS certification. We traced each sensitive request to its server/rules decision, checked identity/immutable-field conditions, inspected all production rule collections and exported callable authorization, examined supply-chain evidence and added isolated regressions.

## 6. Tools and techniques used

Git inventory/diff, ripgrep source searches, read-only Node evidence collector, TypeScript compiler, npm tests/audit, Firebase CLI 15.22.3, Firestore emulator 1.21.0, Storage rules runtime 1.1.3 and Java 25.0.3. npm 11.12.1. Two fresh registry audit attempts failed. Emulators used demo-spartan-booking and loopback hosts with synthetic users/data; no Auth or production service credentials were used in tests.

## 7. Overall security posture

Useful controls include student-only Firestore registration, immutable role/activation for non-admin users, assigned-facilitator authorization, admin callable checks, server-only AI cache writes, validated attempt overrides, attempt-chain limits, append-only audit entries and atomic appointment reservations. Previous October 12 findings about public facilitator signup and global facilitator reads were rechecked against current rules and were not carried forward as current vulnerabilities.

The remaining gaps are material. Client-computed screening risk and overly broad availability/storage access prevent a favorable deployment-security conclusion. Existing mobile/shared-UI compiler failures also prevent a clean workspace validation result.

## 8. Summary of identified vulnerabilities

See VULNERABILITY_FINDINGS.md for the required summary table and complete SEC-001–014 records. Each records evidence class, severity, CWE, exact location, impact, conceptual misuse, patch and verification. No unsupported CVSS scores are assigned.

## 9. Key security risks

SEC-003 exposes other students’ full active appointments; SEC-004 trusts client risk and leaves alert consistency unresolved; SEC-009 Storage file permissions do not match metadata visibility. SEC-005/006 allow notification and legacy slot manipulation. SEC-010 permits selected inactive-owner operations. SEC-011/013 remain provisional operational risks.

## 10. Recommended security improvements

Follow the staged plan for privacy projections, trusted submission/risk/alert generation, notification provenance, legacy slot linkage and complete deactivation. Refresh dependency audits; evaluate privileged MFA, account/password policy, email-enumeration protection and App Check in provider settings. Introduce AI cooldowns and delivery idempotency; validate uploads by content where needed, review download-token expiry and establish retention/backups. Client-written append-only audit logs prevent edits but do not guarantee every admin change is logged; trusted mutation/audit transactions and monitoring are recommended.

## 11. Remediation progress

Patched SEC-001/002/007/008 with emulator verification. Partially addressed SEC-010 (Storage ownership only). Implemented SEC-012 config with static regression and successful web build. No dependencies, credentials, data or schemas were modified. All changes are listed in remediation/SECURITY_FIXES_CHANGELOG.md.

## 12. Remaining risks and limitations

No production rules/functions/headers, Firebase Console password/MFA/email policies, quotas, IAM, credential validity, backups, ACLs, download-token exposure, live logging or external provider behavior were verified. No load test or live exploit was run. Heuristic tracked-source scan is not a full-history secret audit. Historical npm reports include critical package advisories but application reachability is unvalidated; fresh audits failed rather than passed. CORS true does not by itself bypass Firebase bearer-token authorization. No custom cookie/session backend was found; conventional cookie CSRF flags do not directly describe this Firebase SDK design. No confirmed SQL injection, command injection, SSRF, unsafe deserialization or executable DOM sink was found in the reviewed source; this is not proof of absence. Content type/size rules do not constitute malware scanning.

Functions build, web build, 34 first emulator tests, 55 second emulator tests, 29 client/shared tests, 38 offline Functions tests and one header config test passed. These run totals overlap and must not be presented as unique test counts. Five second-run tests intentionally reproduce open gaps; their passing result means a weakness exists. Workspace typecheck failed in unchanged mobile/shared-UI files. Two suites first failed safely without emulator variables and subsequently passed inside the emulator. See PATCH_VERIFICATION.md for commands/results.

## 13. Conclusion

The local project is stronger and ready for focused review of the patches. This assessment does not establish production readiness. Approve and implement the privacy/scoring migrations, resolve validation blockers, refresh dependency evidence and verify actual deployment controls before relying on the system for sensitive data.

## Reference sources

- [OWASP Top 10:2025 — Broken Access Control](https://top10.owasp.org/2025/A01_2025-Broken_Access_Control/) supports server-side access-control review.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) supports object-level authorization and negative permission tests.
- [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions) explains token lifetimes/revocation and automatic refresh-token revocation for password resets.

External references were checked for guidance only; application findings are grounded in local source and isolated tests.
