# Security checklist

Date: October 13, 2026 (Asia/Manila). Checked means verified only within the stated local scope. Unchecked items explicitly distinguish remediation from untested operational controls.

## Authentication

- [x] Student-only Firestore signup rejects direct privileged registration; emulator registration suite passed.
- [x] Firebase Auth used for passwords; application user documents do not store passwords in reviewed source.
- [x] Exported administrative callables enforce active server-read super-admin role; profile/override suites passed.
- [ ] Requires remediation: complete deactivation semantics, SEC-010.
- [ ] Not tested: deployed password policy, brute-force quotas, email enumeration protection, verified-email policy and staff MFA.
- [ ] Not tested: live reset email behavior and account recovery settings.

## Authorization

- [x] Assigned facilitator authorization tested for student records and AI cache/function access.
- [x] Message sender membership and schedule identity enforced locally, SEC-001/008.
- [ ] Requires remediation: private appointment reads, SEC-003.
- [ ] Requires remediation: file visibility/ownership parity, SEC-009.
- [ ] Not tested: IAM/service-account privilege grants and historical staff account approval roster.

## Database and business logic

- [x] Spark atomic reservations/concurrency tests passed; protected booking does not rely solely on UI availability.
- [x] Attempt-chain/override validation and immutable student identity checks tested.
- [x] Existing audit logs reject client update/delete in reviewed rules (static scope).
- [ ] Requires remediation: authoritative assessment submission, risk and alerts; immutable submitted responses, SEC-004.
- [ ] Requires remediation: legacy slot linkage/field restrictions, SEC-006.
- [ ] Not tested: live database configuration, indexes beyond test requirements, encryption settings or backups/restore.

## API and input handling

- [x] Message body size/type and timestamps tested, SEC-001.
- [x] Admin profile schema tests passed and AI upstream target is fixed in source.
- [ ] Requires remediation: recipient-bound notification creation/update and input schemas, SEC-005.
- [ ] Requires remediation: durable AI generation budgets/cooldowns/single-flight, SEC-014.
- [ ] Not tested: App Check rollout, provider quotas, deployment CORS behavior and live rate controls.

## Frontend

- [x] Web compile/build passed; reviewed React content rendered without identified dangerous DOM injection sinks.
- [x] Browser framing/MIME/referrer/limited CSP config regression passed, SEC-012.
- [x] Web consent gate tests passed; consent stores session identity rather than private screening content in reviewed code.
- [ ] Requires hardening: full CSP origin inventory/report-only rollout; current CSP lacks script-src/connect-src.
- [ ] Not tested: browser-based XSS testing, externally authored resource URL payloads, actual live headers and cookie behavior of third-party SDKs.

## Session management

- [x] Firebase SDK handles signed tokens and sign-out; no custom JWT implementation found in reviewed source.
- [x] Device token takeover denied locally, SEC-007.
- [ ] Requires remediation: selected inactive-owner reads/writes, SEC-010.
- [ ] Not tested: live Auth disable/revocation, shared-device session lifetime, persistence policy and logout push-token cleanup.

## Storage and configuration

- [x] Conversation attachment membership tested, SEC-002.
- [x] Inactive Storage owner upload denied, applied portion of SEC-010.
- [x] Size and claimed MIME allowlists exist for document uploads (static check only).
- [ ] Requires remediation: assignment/resource/course visibility and unrelated file deletion, SEC-009.
- [ ] Not tested: actual file content validation, malware scanning, SVG handling, download-token sharing/revocation and live cross-service IAM.
- [ ] Not tested: firewall/service exposure, HTTPS redirects/custom domains, host ACLs and credential key validity, SEC-013.

## Dependencies and supply chain

- [x] Root/workspace/Functions lockfiles present; exact selected versions captured.
- [ ] Requires validation/remediation: historical advisories and staged updates, SEC-011; fresh audits failed network requests.
- [ ] Requires hardening: separately review removal of 9,297 tracked root dependency files and clean installation from lockfile.
- [ ] Not tested: full-history secret scan, registry integrity/provenance and upstream package reachability.

## Logging and data protection

- [x] AI provider error logging omits provider response content in reviewed source.
- [x] Audit artifacts contain sanitized indicators and synthetic test summaries, not user data or raw keys.
- [ ] Requires hardening: trustworthy complete mutation/audit coupling, suspicious access alerts, trigger idempotency and notification privacy previews.
- [ ] Not tested: provider logging retention, student consent/retention policy operation, backup safeguards or restore drill.

## Deployment and verification

- [x] Dynamic tests isolated to demo project and loopback Firestore/Storage; no live migration or deployment run.
- [x] Functions and web build checks passed locally.
- [ ] Requires remediation: existing mobile/shared-UI typecheck failures; see PATCH_VERIFICATION.md.
- [ ] Not tested: Node 20 runtime parity, mobile release/device build, deployed rule/header versions and production monitoring.
- [ ] Requires approval: architectural privacy/scoring/notification migrations documented in REMEDIATION_PLAN.md.
