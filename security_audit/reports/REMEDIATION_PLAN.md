# Remediation plan

Changes here are local and reviewable; no deployment, credential rotation, infrastructure edit or production-data change was made. Architectural changes are proposals requiring approval. P1 precedes P2; P3 is defense in depth.

## Staged rollout requiring approval

1. Address SEC-003 and SEC-009 privacy first: define ownership/visibility, classify existing data, backfill a sanitized availability projection, migrate web/mobile queries and then restrict private reads. Keep reservation conflict enforcement.
2. Address SEC-004: select a trusted execution model compatible with the deployed billing plan; introduce transactional submission/risk/alert generation, verify score parity and reconcile existing records. Do not trust client-derived risk as a clinical authority meanwhile.
3. Migrate notification producers and legacy slot clients (SEC-005/006), then tighten rules; complete inactive-account behavior (SEC-010).
4. Refresh advisories and stage upgrades (SEC-011); operational credential review (SEC-013) requires the key owner’s participation.
5. Add generation limits, trigger defense in depth and monitoring (SEC-014).

No schema migration was applied. Any new collections/indexes must ship with backfill, compatibility and rollback plans. Deploy compiled rules and clients together only after review.

## SEC-001

**Problem:** Message creation lacked conversation membership validation.

**Priority/status:** P1 / Patched; emulator verified. Estimated complexity: Low.

**Files requiring changes:** `spartan-g/firebase/firestore.rules`

**Proposed secure implementation:** Implemented: require an existing conversation containing the caller, string body length 1–4000 and server creation/update timestamps. Follow up with schema validation, trigger membership/type checks, bounded token batches and idempotent delivery.

**Compatibility/migration concerns:** Normal shared sendMessage writes already meet these requirements. Custom import clients using client timestamps now fail. Backend Admin writes bypass rules.

**Testing requirements:** New emulator tests allow student/facilitator members and deny outsiders, inactive accounts, forged senders, missing conversations, malformed/oversized bodies and missing timestamps.

## SEC-002

**Problem:** Conversation attachments exposed to unrelated active users.

**Priority/status:** P1 / Patched; emulator verified. Estimated complexity: Low.

**Files requiring changes:** `spartan-g/firebase/storage.rules`

**Proposed secure implementation:** Implemented: conversation-member read/write, explicit admin read, and member facilitator/admin delete. Admin delete remains allowed. Check legacy download-token URLs separately.

**Compatibility/migration concerns:** Existing paths remain unchanged. Legitimate nonparticipant access is intentionally denied. Cross-service Storage-to-Firestore permissions must be enabled for the release environment; no live configuration was changed.

**Testing requirements:** Storage emulator accepted member upload/read and denied outsider download/replacement. Rules compiled and loaded. Download-token URL revocation and live IAM were not tested.

## SEC-003

**Problem:** Availability queries disclose private appointment records.

**Priority/status:** P1 / Open; approval required. Estimated complexity: High.

**Files requiring changes:** `spartan-g/firebase/firestore.rules`; corresponding shared services, affected web/mobile clients, rules and emulator tests.

**Proposed secure implementation:** Approve a minimal availability projection containing only facilitator ID, interval and occupancy. Backfill without notes/identities, migrate web/mobile readers, preserve reservation transactions, then restrict private reads to the student, facilitator and admin. Use a trusted writer or rigorously validated atomic projection on Spark.

**Compatibility/migration concerns:** Requires collection/index/rules and client query migration; changing only reads breaks booking availability. Backfill and dual-read rollout are required.

**Testing requirements:** Isolated test reproduced unrelated-student read with a synthetic note. After migration invert this test and verify availability and concurrent booking.

## SEC-004

**Problem:** Students control assessment risk metadata and submission integrity.

**Priority/status:** P1 / Open; approval required. Estimated complexity: High.

**Files requiring changes:** `spartan-g/firebase/firestore.rules`; corresponding shared services, affected web/mobile clients, rules and emulator tests.

**Proposed secure implementation:** Approve a trusted submission/scoring transaction with typed question/value validation, publication checks, immutable submitted answers and authoritative risk/alert generation. Recompute all risk fields for AI prompts and statistics; remove student control of derived fields. Audit existing records before treating stored risk as authoritative.

**Compatibility/migration concerns:** Backend scoring/alerts can require a billing/runtime architecture change for Spark. Maintain deterministic attempt IDs, limits and retakes. Existing records need reconciliation, not blind recalculation/deletion.

**Testing requirements:** Emulator accepted a synthetic student-supplied low-risk classification. Require denial of derived-field edits, atomic alerts and matching web/mobile/server scores after migration.

## SEC-005

**Problem:** Authenticated clients can forge notifications for arbitrary recipients.

**Priority/status:** P2 / Open; approval required. Estimated complexity: Medium.

**Files requiring changes:** `spartan-g/firebase/firestore.rules`; corresponding shared services, affected web/mobile clients, rules and emulator tests.

**Proposed secure implementation:** Use trusted notification generation or rule-validated atomic events that bind sender, recipient and related entity via getAfter. Restrict owner updates to read-state/timestamps with immutable recipient; validate schema and length.

**Compatibility/migration concerns:** Denying all cross-user create immediately breaks existing notifications. Migrate each producer and verify booking acceptance/rescheduling and messaging delivery.

**Testing requirements:** Emulator reproduced an outsider notification write. Invert after migration and test all legitimate producers.

## SEC-006

**Problem:** Legacy appointment-slot reservations permit unrelated record tampering.

**Priority/status:** P2 / Open; approval required. Estimated complexity: Medium.

**Files requiring changes:** `spartan-g/firebase/firestore.rules`; corresponding shared services, affected web/mobile clients, rules and emulator tests.

**Proposed secure implementation:** Inventory legacy consumers. If still used, bind reservation to an owned appointment in the same transaction with getAfter and immutable owner/time; otherwise explicitly retire student slot writes after client migration.

**Compatibility/migration concerns:** Legacy mobile/slot-based clients may rely on this route; do not remove before identifying consumers.

**Testing requirements:** Emulator reproduced reservation with nonexistent appointment and altered ownership/time. Verify atomic linkage and immutable fields after migration.

## SEC-007

**Problem:** Device-token updates could take over another owner’s document.

**Priority/status:** P2 / Patched; emulator verified. Estimated complexity: Low.

**Files requiring changes:** `spartan-g/firebase/firestore.rules`

**Proposed secure implementation:** Implemented: active-user creation; updates require the existing owner and unchanged uid. Follow up with token schema/length limits and explicit account-switch cleanup.

**Compatibility/migration concerns:** Normal uid_platform registration can still create and refresh its own document. Inactive account registrations now fail.

**Testing requirements:** Emulator allowed own creation/refresh, denied outsider takeover and denied inactive refresh.

## SEC-008

**Problem:** Facilitators could rewrite schedule ownership.

**Priority/status:** P2 / Patched; emulator verified. Estimated complexity: Low.

**Files requiring changes:** `spartan-g/firebase/firestore.rules`

**Proposed secure implementation:** Implemented: require unchanged facilitatorId during updates. Follow up with server-enforced weekday/time schema and overlap checks.

**Compatibility/migration concerns:** Normal same-owner schedule edits are preserved. Client ownership transfer is intentionally rejected.

**Testing requirements:** Emulator accepted an own weekday edit and rejected an ownership transfer.

## SEC-009

**Problem:** Assignment and resource file access ignores record-level visibility.

**Priority/status:** P1 / Open; approval required. Estimated complexity: High.

**Files requiring changes:** `spartan-g/firebase/storage.rules`; corresponding shared services, affected web/mobile clients, rules and emulator tests.

**Proposed secure implementation:** Approve ownership/assigned-facilitator checks for assignment reads/deletes; mirror resource audience/publication checks and course publication/management permissions through Firestore documents. Classify legacy objects and revoke long-lived download tokens if required.

**Compatibility/migration concerns:** Legacy assignments/course ownership policy must be defined; some resource entries may be missing metadata. Existing token URLs have a separate authorization lifecycle.

**Testing requirements:** Confirmed directly from allow conditions and contrasting metadata rules, not an executed download from live storage. Require positive/negative Storage emulator tests for each audience and relationship.

## SEC-010

**Problem:** Deactivation does not consistently remove owner access.

**Priority/status:** P2 / Partially addressed; open. Estimated complexity: Medium.

**Files requiring changes:** `spartan-g/firebase/firestore.rules`; corresponding shared services, affected web/mobile clients, rules and emulator tests.

**Proposed secure implementation:** Implemented active-account Storage ownership check. Approve per-operation Firestore active checks that preserve initial registration and document reads needed to report deactivation; consider Auth disable/revocation and tested revoked-token enforcement.

**Compatibility/migration concerns:** Changing global Firestore isOwner risks registration/session discovery. Firebase password reset already revokes refresh tokens automatically; do not infer a password-reset revocation bug from a missing explicit call.

**Testing requirements:** Storage emulator denied inactive avatar upload; Firestore emulator reproduced inactive profile read. Full deactivation remains unresolved.

## SEC-011

**Problem:** Historical dependency advisories require fresh validation.

**Priority/status:** P1 / Open; registry validation unavailable. Estimated complexity: High.

**Files requiring changes:** `spartan-g/package-lock.json`

**Proposed secure implementation:** Rerun audit with registry access for all three lockfiles and separate production/build/mobile exposure. Upgrade Functions/Admin and Expo/React Native/Vite in tested stages; avoid audit fix --force. Remove tracked root node_modules in a separately reviewed cleanup and reinstall from lockfiles.

**Compatibility/migration concerns:** Historical suggested upgrades include major versions; Expo/native compatibility and Functions Node runtime need review. No dependencies were changed.

**Testing requirements:** Fresh audits returned errors, not clean results. Rerun full and omit=dev audits; verify advisory ranges, release builds, emulators and device builds.

## SEC-012

**Problem:** Hosting configuration omitted browser defense headers.

**Priority/status:** P3 / Patched configuration; static test verified. Estimated complexity: Low.

**Files requiring changes:** `spartan-g/firebase.json`

**Proposed secure implementation:** Implemented X-Frame-Options DENY, nosniff, strict-origin-when-cross-origin, and CSP frame-ancestors/object-src/base-uri. Develop a full CSP in report-only mode after inventorying Firebase, Google Fonts, YouTube and other required origins.

**Compatibility/migration concerns:** Embedding the portal is blocked; outbound YouTube frames are unaffected by frame-ancestors. Current CSP does not restrict script-src or connect-src.

**Testing requirements:** One local configuration test passed; web build passed. Live header delivery needs verification after an authorized deployment.

## SEC-013

**Problem:** Privileged service-account files present locally; exposure not established.

**Priority/status:** P1 / Open; operational review required. Estimated complexity: High.

**Files requiring changes:** `spartan-g/scripts/migrate-appointment-reservations.mjs`

**Proposed secure implementation:** Inventory key owners, usage, IAM grants, ACLs and backup distribution; prefer short-lived ADC/workload identity. Rotate only if exposure is confirmed or owner approves. Keep migrations explicitly targeted, dry-run-first and gated; never copy keys into reports.

**Compatibility/migration concerns:** Credential rotation and IAM edits can interrupt maintenance/deployments and were not performed. No production migration script was executed.

**Testing requirements:** Sanitized evidence records paths and boolean indicators only. Review history and provider key inventory through an authorized operational review.

## SEC-014

**Problem:** AI summary regeneration lacks application-level abuse controls.

**Priority/status:** P2 / Open; design review required. Estimated complexity: Medium.

**Files requiring changes:** `spartan-g/firebase/functions/src/assessmentSummary.ts`

**Proposed secure implementation:** Add a durable per-actor/attempt cooldown, single-flight generation lease, explicit regeneration authorization and budgets. Integrate App Check only after configuring web/mobile clients; preserve staff assignment checks.

**Compatibility/migration concerns:** App Check-only server enablement breaks clients without attestations. Rate controls must span function instances; an in-memory limiter is insufficient.

**Testing requirements:** Static source evidence only; no provider calls or load testing. Test rate/lease behavior against a stub and concurrent isolated requests.
