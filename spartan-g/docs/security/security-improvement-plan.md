# SPARTAN-G security review and improvement plan

Reviewed: October 12, 2026 (Asia/Manila)

Baseline: `main`, commit `d0915e8`

Deliverable: source review and remediation plan; application behavior has not been changed.

## Executive assessment

The highest priority is closing the authorization gaps in Firebase Security Rules. Both registration clients allow anyone to select facilitator, and the rules accept that role with `isActive: true`. Facilitators can then read student profiles, screening answers, risk records and appointments across the system, and modify many shared records. Hiding the facilitator option in the UI alone will not fix this.

Address these first:

1. Make facilitator access administrator-approved and prevent privileged self-registration.
2. Restrict sensitive reads and writes to the student, assigned facilitator and explicitly authorized administrator.
3. Enforce conversation membership for message creation and attachment access.
4. Move assessment submission, risk calculation and alert creation to the backend.
5. Replace full appointment reads for availability with a minimal availability projection.
6. Update vulnerable dependencies in tested stages and protect privileged credentials.

The current code already has useful defenses: administrator callables check the active role on the server, direct appointment creation is denied, booking uses serialized transactions, AI API credentials use Secret Manager, AI summaries cannot be written by clients, audit entries cannot be edited or deleted by clients, and overrides have meaningful rule validation. Preserve these while tightening the remaining paths.

## Scope, method and limits

Repository-wide file inventory and security-pattern searches covered web and mobile applications, shared services/types/UI, all production Firestore and Storage rules, exported Cloud Functions, operational scripts, launcher/configuration files and dependency manifests/lockfiles. Detailed reads focused on authentication, administrative operations, messaging, assessments, risk alerts, scheduling, uploads, client persistence and deployment/test configuration. This is a risk-based static review, not a claim that every line or dependency was manually audited.

Evidence references below use repository-root-relative `path:line` locations at the baseline commit. Severity describes source-level impact. Findings marked **confirmed** follow directly from the source; their presence in a deployed environment depends on which rules/functions are deployed. **Hardening** items describe missing defenses or operational checks, not demonstrated compromises.

No production database was queried, no credentials were used to authenticate, no exploit was sent to a live service, and no rules were deployed. Existing emulator suites were inspected but not executed during this review. Firebase Console settings, IAM permissions, actual hosting headers, key validity, backups and real data remain unverified. No private-key contents are included here.

Three independent `npm.cmd audit --omit=dev --json` runs completed against the public npm registry:

- App workspace (`spartan-g`): 71 flagged packages: 2 critical, 48 high, 21 moderate.
- Backend functions: 10 flagged packages: 2 high, 8 moderate.
- Repository root: 5 flagged packages: 4 high, 1 moderate.

These are affected-package counts, including dependency chains, not counts of independent exploitable application flaws. Do not add the three totals together: dependency trees overlap. The workspace includes Expo tooling through production dependencies. Development-only dependencies were omitted, so the results do not fully cover Vite/build tooling.

Raw evidence is saved beside this report:

- [Workspace dependency audit](security-audit-workspaces-2026-10-12.json)
- [Functions dependency audit](security-audit-functions-2026-10-12.json)
- [Root dependency audit](security-audit-root-2026-10-12.json)

## Findings and implementation guidance

### SEC-01 — Critical / confirmed: public facilitator registration grants privileged access

**Evidence:** `spartan-g/firebase/firestore.rules:54`, `spartan-g/apps/web/src/lib/auth.ts:19`, `spartan-g/apps/web/src/pages/RegisterPage.tsx:155`, `spartan-g/packages/shared-services/src/services/auth.service.ts:40`, `spartan-g/apps/mobile/src/screens/auth/RegisterScreen.tsx:140`.

An authenticated user can create their own active user document with either student or facilitator role. This is also offered directly in both registration UIs. The active facilitator role unlocks broad access through `isFacilitatorOrAdmin()`.

**How to improve:** allow public registration to create only a student account using a strict field schema. Create a separate facilitator application/invitation workflow with no staff privileges while pending. An active super administrator should approve a verified staff identity through a callable that checks authority on the server, changes the role, records the decision and revokes sessions as appropriate. Keep role and activation fields server-managed. Update both web and mobile flows; enforce the policy in rules regardless of client input. Review existing facilitator accounts against an approved staff roster before treating them as trusted.

**Acceptance:** self-signup with facilitator or super-admin role is denied using the SDK/REST directly; an approved staff account can use its permitted workflows; a pending or disabled account cannot access student information.

### SEC-02 — High / confirmed: facilitators have system-wide access to sensitive records

**Evidence:** `spartan-g/firebase/firestore.rules:45`, `:78`, `:209`, `:219`, `:245`, `:367`, `:376`, `:389`, `:446`; `spartan-g/firebase/functions/src/assessmentSummary.ts:191`.

Role checks permit every active facilitator to read all student users/profiles, responses, attempts, risk alerts, AI summaries and appointments. Several collections also permit global facilitator updates/deletes. The summary callable checks facilitator role but does not check whether the caller is assigned to the attempt's student. Even after fixing registration, one compromised staff account retains excessive reach.

**How to improve:** define one assignment policy, such as an administrator/assigned-facilitator-approved relationship with `status == 'accepted'`. Apply it consistently in rules and backend helpers. Require `resource.data.facilitatorId == request.auth.uid` or a verified relationship for staff access; authorize summary generation before returning cached or newly generated content. Keep administrators' access explicit and audited. Separate a minimal facilitator directory from private account/profile fields because Firestore reads return whole documents. Update queries to include the ownership/assignment constraints; client filtering does not restrict what can be downloaded. Decide explicitly whether cross-campus access is allowed before implementing campus restrictions.

**Acceptance:** facilitator A cannot read, summarize, edit or delete facilitator B's student records by changing document IDs or queries. The assigned facilitator and authorized administrator retain access.

### SEC-03 — High / confirmed: students can read other students' active appointments

**Evidence:** `spartan-g/firebase/firestore.rules:217`; `spartan-g/packages/shared-types/src/types/firestore.types.ts` (`AppointmentDocument`).

Students may read any requested or accepted appointment with a string facilitator ID. A read exposes the full record, including student identity, notes and any facilitator/outcome fields present, rather than only the occupied time interval.

**How to improve:** limit private appointment reads to its student, assigned facilitator and authorized administrator. Publish a separate server-maintained availability collection containing only facilitator ID and occupied start/end times. Alternatively return a minimal availability response from an authenticated callable. Keep private notes in separately authorized documents if the student should not see them. Preserve backend overlap checks even if availability is stale.

**Acceptance:** student A cannot read student B's appointment, but can still determine which time windows are unavailable without receiving identities or notes.

### SEC-04 — High / confirmed: message creation does not require conversation membership

**Evidence:** `spartan-g/firebase/firestore.rules:290`; `spartan-g/firebase/functions/src/onMessageCreate.ts:28`.

An active account can create a message with its own sender ID and an arbitrary conversation ID. The trigger reads the conversation and sends push notifications without checking that the sender is a participant. A known conversation ID therefore permits unauthorized message injection and notification abuse. This does not, by itself, permit reading other participants' existing messages.

**How to improve:** require an existing conversation whose participant list contains the caller, immutable sender/conversation IDs, allowed fields, bounded text, valid message type and server timestamps. Independently validate sender membership and active status in the trigger, since Admin SDK operations bypass rules. Process deliveries idempotently with an event/message delivery record; Firestore triggers can be retried. Bound recipient/token batches and remove invalid tokens. Treat system messages as server-generated only.

**Acceptance:** a nonparticipant cannot write into a real conversation, and an invalid message introduced through a trusted backend does not cause a push delivery. Retrying a trigger does not duplicate notifications.

### SEC-05 — High / confirmed: Storage rules do not protect conversation or assignment privacy

**Evidence:** `spartan-g/firebase/storage.rules:54`, `:67`, `:76`; `spartan-g/packages/shared-services/src/services/storage.service.ts:31`.

Any active user can read assignment uploads and message attachments. Any active user can write or replace a permitted file under any conversation's attachment path. Any facilitator can delete message attachments globally. Resource file access also ignores the publication/audience conditions enforced on resource metadata.

**How to improve:** look up the conversation and require participant membership for attachment reads/writes. Add uploader UID and an unpredictable attachment ID to object paths; allow replacement/deletion only to the uploader or an explicitly authorized moderation workflow. Restrict assignment reads to the owner and assigned instructor, and enforce resource publication/audience consistently across Firestore and Storage. Store object paths for sensitive files and use authenticated downloads rather than treating a download URL as proof of authorization. Review existing tokenized download links and revoke/replace sensitive links where necessary; test link access after sign-out and permission changes in staging.

**Acceptance:** nonparticipants cannot download, overwrite or delete attachments; unrelated students cannot fetch submissions; unpublished/staff-only resource files cannot be obtained by students through Storage.

### SEC-06 — High / confirmed: assessment identity and derived results are client-editable

**Evidence:** `spartan-g/firebase/firestore.rules:364`, `:367`, `:378`, `:380`, `:453`, `:457`; `spartan-g/packages/shared-services/src/services/assessment.service.ts:399`.

Student updates to in-progress attempts only block `score` and `feedback`. They can change `studentId`, `assessmentId`, `attemptNumber`, timestamps, risk level/score and flags. Creation does not prohibit supplied derived fields. Responses may be updated without checking their parent assessment's submitted state, and response/submission creation can include grading fields. Client services impose stronger checks than the actual rules, so direct requests can bypass them. Students can also create their own assessment documents, whose `maxAttempts` is later trusted by the attempt-limit helper; distinguish legitimate template instances from trusted published definitions.

**How to improve:** separate assessment definitions from student assessment instances and give each a strict schema. Make owner IDs, definition IDs, attempt number and server-derived fields immutable. Allow clients only bounded draft answers while the parent is in progress. Implement a transactional `submitAssessment` callable that validates every question and allowed answer value against a versioned definition, computes all risk metadata on the server and freezes the submission. Deny client writes to grades, review state, risk fields and submission timestamps. Preserve deterministic attempt IDs and server-side attempt limits, but ensure their source definition is trusted and available to this student.

**Acceptance:** changing IDs, injecting scores/risk metadata, submitting invalid answers, creating a private definition to bypass limits or editing a submitted response is denied. The server computes the same expected result for a validated input set.

### SEC-07 — High / confirmed: automatic risk alerts fail for normal student submissions

**Evidence:** `spartan-g/packages/shared-services/src/services/assessment.service.ts:448`, `spartan-g/packages/shared-services/src/services/risk-alert.service.ts:51`, `spartan-g/firebase/firestore.rules:209`, `spartan-g/firebase/functions/src/index.ts`.

After a student submits, the client tries to create a risk alert. Rules allow only facilitators/admins to create these alerts. The submission service silently swallows the failure, and the exported backend functions contain no assessment-submission alert handler. A student can also skip the client alert code entirely. This affects the integrity and reliability of a security-sensitive workflow.

**How to improve:** create risk alerts during server-side submission or through a durable server event/outbox. Compute alert data from validated stored answers, not a caller-supplied evaluation. Use one deterministic alert ID per attempt/rule version so retries do not duplicate it. Record a processing status and retry failed deliveries. Alert on persistent processing failures without logging answers. Keep student alert creation denied.

**Acceptance:** submitting an elevated-risk fixture creates exactly one assigned alert, even when the app closes immediately afterward; failed downstream notifications are retried and visible to operations.

### SEC-08 — High / confirmed: relationship requests can be changed into approved relationships

**Evidence:** `spartan-g/firebase/firestore.rules:244`.

A student may create a link with their own student ID without a required pending state, and can update an existing pending link without restricting changed fields or the new status. This permits self-approval and changing the relationship's student/facilitator IDs. It becomes especially dangerous if link status is used to fix SEC-02.

**How to improve:** require `studentId == caller`, a valid active facilitator, deterministic relationship ID and `status == 'pending'` at request creation. Preserve both identities on every update. Only the named facilitator or authorized administrator may accept/reject; students may only cancel a pending request with an allowed transition. Establish these constraints before using links for authorization. Prefer server-managed approval and conversation provisioning.

**Acceptance:** student requests cannot start accepted, accept themselves, switch facilitator IDs or change owners; unrelated facilitators cannot approve requests.

### SEC-09 — High / confirmed: slot updates permit unauthorized field changes and reservation abuse

**Evidence:** `spartan-g/firebase/firestore.rules:308`, `:320`, `:337`; `spartan-g/packages/shared-services/src/services/appointment-slot.service.ts:145`.

The student reservation rule only checks old available status, new reserved status and a string appointment ID. It does not verify the appointment exists or belongs to the student, and does not limit changed fields. A student can reserve slots with made-up IDs, change times/facilitator IDs or exhaust availability. Facilitator slot/work-hours updates also do not freeze owner IDs. Appointment updates allow any active facilitator to change other facilitators' records, including clinical notes, within the small existing scheduling-field blacklist.

**How to improve:** reserve/release slots in the backend booking transaction and deny direct student slot updates. Verify slot ownership, time range, state, linked appointment and facilitator availability. For staff schedules freeze facilitator ID, validate bounded durations/time ranges and allow only explicit fields. Limit appointment actions to the assigned facilitator and enforce an explicit status-transition map. Preserve current overlap locks.

**Acceptance:** nonexistent/foreign appointment IDs, owner/time changes and unrelated staff actions are denied; concurrent booking yields one winner and consistent appointment/slot state.

### SEC-10 — Medium / confirmed: notification and device-token writes are too permissive

**Evidence:** `spartan-g/firebase/firestore.rules:159`, `:166`; `spartan-g/apps/mobile/src/adapters/expo-messaging.adapter.ts`; `spartan-g/firebase/functions/src/onMessageCreate.ts:42`.

Any authenticated account, including one without an active profile, can create notifications for arbitrary recipients. Notification owner updates may change any field, including ownership. Device-token updates only validate the new UID, so a caller who knows another token document ID can overwrite that record with their own UID and token. The mobile adapter obtains Expo push tokens while the trigger sends all registered tokens through FCM, so provider handling is inconsistent.

**How to improve:** make notification creation server-only and permit recipients to change only read state/timestamp. Require active users for device registration; require both old and new UID to equal the caller on updates. Use a per-user device subcollection, validate token/provider/platform/length, and remove registrations on logout or account reassignment. Route Expo and FCM tokens through the correct provider. Use generic push text for counseling messages because previews can appear on locked screens.

**Acceptance:** arbitrary-recipient notifications, changed notification ownership and cross-user token overwrites fail. Delivery uses the declared provider and contains no private message preview by default.

### SEC-11 — High / confirmed dependency findings: vulnerable dependency trees

**Evidence:** the three saved audit JSON files and their corresponding manifests/lockfiles.

Workspace critical flags include `shell-quote` command injection and `tar` archive handling/denial-of-service advisories. High-severity findings include Firebase/gRPC and Expo/React Native dependency chains. Backend findings include `node-forge` signature-verification issues inherited through `firebase-admin`. Exploitability depends on whether the vulnerable APIs process attacker-controlled data; no application exploit was demonstrated. See the audit's individual `via`, `nodes` and advisory URLs rather than assuming every transitive package reaches the browser.

**How to improve:** update nonbreaking transitive patches first, then separately upgrade Firebase client/Admin SDK/Functions and the coordinated Expo/React Native stack. Use `npm explain <package>` to trace each affected package. Audit suggested major upgrades and even a Firebase downgrade in this run; do not blindly apply `npm audit fix --force`. Select maintained compatible releases, update lockfiles and test auth, rules, messaging, scheduling and mobile builds. Audit build dependencies too with `npm.cmd audit --json`. Remove redundant root dependencies if they have no active consumer, and install using `npm ci` in CI.

**Acceptance:** refreshed audits contain no unresolved reachable high/critical issues, or document reachability and a dated exception. All app/backend build and relevant integration checks pass after each upgrade stage.

### SEC-12 — High potential impact / credential hardening: a local service-account private key exists

**Evidence:** a `*-firebase-adminsdk-*.json` file under `spartan-g` contains a `private_key` field. `git check-ignore` confirms it is ignored. No matching filenames appeared in the available local Git history. `spartan-g/scripts/promote-superadmin.mjs` and `scripts/cleanup-users.mjs` expect a separate `scripts/service-account.json` credential.

This is confirmed local credential storage, not proof that the key is valid, leaked or committed. Anyone obtaining a valid key can use its IAM permissions; Admin SDK access does not rely on client rules.

**How to improve:** move credentials outside the project/package boundary and use Application Default Credentials with scoped impersonation, workload identity or managed runtime identities where possible. Review actual IAM roles and remove broad Owner/Editor access from runtime identities. Revoke the key if its custody is uncertain or it was shared; verify replacement access before retirement. Continue ignoring credentials, and add secret scanning to commits/CI and release packaging. Public Firebase client config/API keys are distinct from private Admin SDK/Gemini credentials and should not be described as secret leaks merely because they appear in a bundle. See [Google's service-account key guidance](https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys).

**Acceptance:** production credentials are absent from project archives/builds; runtime identities have only required permissions; secret scanning blocks a synthetic key fixture; any retired credential can no longer authenticate.

### SEC-13 — Medium / hardening: privileged calls lack recent-login and MFA enforcement

**Evidence:** `spartan-g/firebase/functions/src/adminUserFunctions.ts:19`, `:87`; role checks across other callables. No source implementation was found for MFA or recent `auth_time` enforcement.

The server correctly verifies active administrator role, but an already authenticated administrator session can change another account's password without step-up verification. Auth failures in web/shared services leave the Firebase session signed in even when the application marks the user unauthenticated. Some owner/auth-only rules then still work, especially for disabled users.

**How to improve:** require MFA for staff/admins using a supported Firebase Authentication configuration, and verify a recent authentication time plus required second-factor policy on sensitive server actions. Prefer sending a user-controlled reset link over administrator-chosen passwords. Apply server password policy, review reset-related session behavior, and implement session revocation checks for incident response; do not assume existing ID tokens are immediately unusable. Sign out when profile/role/active validation fails. Make owner rules require active status wherever disabled accounts should lose access. Implement verified-email enrollment/approval as appropriate, including server/rules checks rather than only a UI badge. Verify email-enumeration protection and reset response behavior in Firebase settings. See [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions).

**Acceptance:** stale/non-MFA staff sessions cannot perform sensitive actions; deactivated users cannot write through owner/auth-only paths; failed application login leaves no usable Firebase session.

### SEC-14 — Medium / hardening: AI generation permits uncontrolled spend and untrusted risk context

**Evidence:** `spartan-g/firebase/functions/src/assessmentSummary.ts:184`, `:200`, `:235`; `spartan-g/firebase/functions/src/assessmentScoring.ts:9`.

Any active facilitator can force regeneration for any attempt, bypassing the cache. There is no per-caller quota or in-flight request lock. Domain scores are recomputed, but the overall risk level/score come from client-editable attempt fields. Numeric parsing accepts values outside the expected scale and overall risk level is interpolated as arbitrary text. Parallel/repeated requests can incur cost and influence generated narrative.

**How to improve:** complete SEC-02/06 first. Recompute every derived input from validated submitted answers; reject missing, duplicate and out-of-range values. Generate from a structured server schema with fixed risk enums. Rate-limit by caller/attempt and add a transactional generation lease. Restrict force regeneration, cap output, set concurrency/instance limits and vendor quotas, and monitor spend. Version the cache by answer digest/scoring/prompt/model version so results cannot become stale after allowed staff corrections. Retain minimal external input; the current prompt omits names and raw free-text answers, which is useful. Record the intended data-sharing policy and avoid storing provider response bodies in logs where they could contain sensitive content.

**Acceptance:** an unrelated facilitator is denied, parallel generation makes one vendor request, quotas reject excess calls, and invalid risk values never reach the model.

### SEC-15 — Medium / confirmed: persistent browser cache is enabled without a device decision

**Evidence:** `spartan-g/packages/shared-services/src/firebase/firestore.ts:30`, `spartan-g/apps/web/src/lib/auth.ts:100`, `spartan-g/packages/shared-services/src/services/auth.service.ts:79`.

Shared Firestore initialization automatically enables multi-tab IndexedDB persistence. Sign-out paths do not clear this cache. The web app has two Firebase access layers; verify the exact cache behavior of both rather than assuming one setting covers all reads. Previously downloaded counseling data can remain on a shared device after logout or deactivation. Firebase specifically recommends checking whether a device is trusted before enabling persistence for sensitive information. See [Firestore offline access](https://firebase.google.com/docs/firestore/manage-data/enable-offline).

**How to improve:** use memory-only caching by default for web counseling/admin screens. If persistent access is necessary, require an explicit trusted-device decision, define retention and terminate listeners before a supported cache-clear lifecycle. Clear in-memory stores on account switching and use suitable staff session persistence/idle policy. For mobile, verify actual Firebase Auth/cache persistence and OS backup behavior in release builds; do not assume secure persistence from the use of Expo alone.

**Acceptance:** shared-device logout/account switching leaves no previous user's records in application state or supported persistent caches, including multi-tab and offline scenarios.

### SEC-16 — Medium / confirmed: development seeder ships in the normal router

**Evidence:** `spartan-g/apps/web/src/navigation/AppRouter.tsx:9`, `:155`, `spartan-g/apps/web/src/pages/dev/SeederPage.tsx:516`.

`/dev/seed` is unconditionally reachable and imports a page that overwrites a fixed assessment with `setDoc`. Rules still govern the write, so this is not an unauthenticated Admin SDK backdoor. An active facilitator can use the existing assessment update permission to overwrite the target definition, including through this page.

**How to improve:** remove seed tools from production routing/builds. Use an emulator-only script requiring an explicit demo project ID and emulator host; refuse non-emulator operation. If a development UI remains, gate it with `import.meta.env.DEV` and appropriate authorization, and dynamically import it only inside that branch. Fix definition ownership separately under SEC-02/06.

**Acceptance:** production output contains no working seed route; seed scripts refuse live project execution.

### SEC-17 — Medium / confirmed: administrative auditing is optional for direct client writes

**Evidence:** `spartan-g/firebase/firestore.rules:66`, `:118`, `:186`, `:400`; `spartan-g/packages/shared-services/src/services/admin.service.ts:56`; `spartan-g/firebase/functions/src/adminUserFunctions.ts:112`; `spartan-g/scripts/promote-superadmin.mjs`.

Client audit entries are append-only and actor-bound, but permitted direct admin document writes need not create an audit entry at all. Resource/profile operations and override writes can bypass the client audit service. Auth updates occur before the audit write, so an audit failure can follow a successful password/name change. The promotion script also forces `isActive: true`, including demotion, despite its comment saying activation is preserved.

**How to improve:** route privileged state changes through server operations and deny equivalent direct client mutations. Commit Firestore changes plus an immutable audit event in one transaction where possible. For Firebase Auth changes, use a durable operation/outbox with explicit completion/failure states and reconciliation because Auth and Firestore are not one transaction. Derive actor/action/target and timestamps on the server. Prevent client-created entries from impersonating server-origin metadata. Audit role/activation changes and preserve activation unless an explicitly authorized action changes it. Keep restricted, retained Cloud Audit Logs as an additional evidence source.

**Acceptance:** every privileged mutation has a corresponding server-authored event; injected audit-write failures produce a recoverable operation rather than an ambiguous retry; role demotion does not reactivate a disabled account.

### SEC-18 — Medium / hardening: upload validation relies on client MIME metadata

**Evidence:** `spartan-g/firebase/storage.rules:31`, `:36`, `:63`.

Size/MIME restrictions exist for several paths, but avatar rules accept `image/.*`, including SVG. MIME metadata is supplied by the uploader and does not prove file contents. Course-media uploads have no comparable size/type bounds. These conditions leave malware, oversized-content and unsafe-format risks; no executed XSS payload was demonstrated. Message text and AI summary text are rendered through React text interpolation in the inspected components, which is a useful existing defense.

**How to improve:** restrict avatars to required raster formats, decode/re-encode them server-side, strip metadata and limit dimensions. Upload documents into a quarantine path; inspect actual signatures, scan supported files, reject mismatches and publish only validated objects. Apply size/type bounds to every writable media path. Serve active/document formats with safe content disposition and avoid inline rendering of arbitrary uploaded content. Enforce allowed external URL protocols at persistence and rendering boundaries, not just the resource form.

**Acceptance:** SVG/HTML disguised as an image is rejected; unscanned uploads are unreadable; all write paths enforce size limits; uploaded content cannot introduce script execution.

### SEC-19 — Medium / operational hardening: deployment, test and destructive-script safeguards need strengthening

**Evidence:** `spartan-g/firebase.json`, `spartan-g/firebase.smoke-test.json`, `spartan-g/firebase/functions/test/fixtures/open.rules`, `spartan-g/scripts/cleanup-users.mjs`, `start-system.bat`.

The smoke configuration points to intentionally open rules. Existing tests have emulator guards, but that configuration could be selected during a deploy. The cleanup script defaults to a dry run, which is good, but `--yes` can delete all Auth users and account documents using whichever project the credential targets. The launcher starts Vite, a development server; production hosting/security headers are not configured in the inspected Firebase config. Actual production hosting is unknown, so missing deployed headers are not confirmed.

**How to improve:** use a CI deployment command with an explicit project/config allowlist, fail if rules point to test fixtures and exclude test configurations from production packages. Keep separate demo/staging/production identities. Require typed target project confirmation, verified backup/restore point and environment guards for destructive scripts; log an operation summary without exporting personal data. Deploy static build output through a production host. Verify HTTPS and configure a tested CSP, `frame-ancestors`, `X-Content-Type-Options`, Referrer-Policy and appropriate Permissions-Policy; test Firebase and required embed/network origins before CSP enforcement. Do not expose Vite/Metro development servers publicly. Verify backup recovery and retention for sensitive records.

**Acceptance:** CI cannot deploy open fixture rules or target an unexpected project; cleanup cannot silently operate on production; staging headers pass browser verification without breaking legitimate flows; restore procedures are tested.

### SEC-20 — Medium / hardening: abuse controls and authorization regression coverage are incomplete

**Evidence:** options on exported `onCall` functions in `spartan-g/firebase/functions/src`; existing tests under `firebase/functions/test`; no repository security CI workflow found in the inventory.

Callables verify identity/roles in several paths, but do not enable App Check in source. No source-level per-user throttling was found for AI generation or booking. CORS is permissive; CORS is not an authorization boundary and tightening it alone will not stop direct clients. Existing booking/profile/override/chain tests cover useful behavior, but do not establish the negative authorization cases listed in this report. Smoke tests with open rules are not proof of authorization security.

**How to improve:** initialize supported App Check providers in web/mobile, observe metrics in staging, then enable enforcement for supported Firestore/Storage/callable paths. Keep emulator/debug tokens out of releases. Consider replay protection for high-impact calls where supported. Add transactional per-user quotas, request idempotency and bounded scheduling duration/lead time to prevent reservation/cost exhaustion. Add Firebase Rules emulator tests with distinct attacker/owner/staff/admin contexts and run them in CI against the production rules. Alert on denied-access spikes, unusual role changes, failed alert processing and abnormal AI/booking rates without recording counseling text. See [App Check callable enforcement](https://firebase.google.com/docs/app-check/cloud-functions) and [Firebase rules testing](https://firebase.google.com/docs/rules/unit-tests).

**Acceptance:** missing/invalid App Check is rejected after rollout, authenticated abuse is throttled, retries are idempotent, and the negative authorization tests below are deployment gates.

## Implementation order

### Phase 1 — Close immediate access paths

- Implement SEC-01 and review existing privileged accounts.
- Fix message membership and private Storage access (SEC-04/05).
- Split private appointments from minimal availability (SEC-03).
- Fix relationship approval before trusting relationship-based access (SEC-08).
- Restrict facilitator access consistently across rules, queries and callables (SEC-02).
- Disable production seeding (SEC-16), verify local credential custody (SEC-12), and begin nonbreaking dependency patches (SEC-11).

Prepare rules, client query changes and any minimal-data projections together. Test existing flows in staging before deployment; tightening reads without adjusting queries will produce permission failures. Revoke previously distributed sensitive download tokens where required. Review existing malformed/self-approved records rather than only blocking new ones.

### Phase 2 — Move authoritative workflows to the backend

- Separate published definitions from student instances.
- Implement validated transactional assessment submission, server risk calculation and reliable alert generation (SEC-06/07).
- Make booking/slot/relationship transitions server-authorized and atomic (SEC-08/09).
- Make notifications server-written and device registration owner-safe (SEC-10).
- Centralize privileged mutations and durable audit events (SEC-17).

Keep old clients compatible through an explicit migration/version policy, then close legacy write paths. A migration that leaves permissive fallback rules would preserve the vulnerabilities.

### Phase 3 — Strengthen sessions, abuse controls and operations

- Complete staged dependency upgrades with mobile release-build checks.
- Add MFA, recent-login enforcement, verified enrollment and disabled-session handling (SEC-13).
- Add App Check, throttling, idempotency and AI generation leases/quotas (SEC-14/20).
- Set cache/device policies, scan uploads and verify production headers (SEC-15/18/19).
- Add CI secret/rules/dependency checks, monitoring, retention and tested restores.

## Security test plan

Use a demo project and production rules in the Firebase Emulator Suite. Add separate student A/B, facilitator A/B, pending staff, disabled user and super-admin fixtures. Use authenticated client SDKs for rule tests; Admin SDK setup is suitable for fixture seeding but cannot test denial because it bypasses rules. [Firebase documents field allowlists and this server/client distinction](https://firebase.google.com/docs/firestore/security/rules-fields).

Required denial cases:

1. Public creation of privileged or active-staff accounts; editing role/activation/owner IDs.
2. Student-to-student reads of appointments, responses, submissions and uploads.
3. Unassigned facilitator reads, updates, deletion and cached/new AI summary generation.
4. Nonparticipant message creation, attachment download/overwrite, and client system messages.
5. Forged accepted links and approval by unrelated staff.
6. Response edits after submission; injected grading/risk fields on create/update; changed attempt identities; invalid/duplicate answers; untrusted definitions bypassing limits.
7. Fake slot reservations, changed slot times/owners, excessive duration and booking floods.
8. Arbitrary-recipient notifications, notification-owner changes and token takeover.
9. Disabled-account operations through every owner/auth-only rule and Storage path.
10. Direct privileged mutations without server audit events, stale admin sessions and invalid App Check.

Required successful/integration cases:

- Legitimate student registration and approved staff provisioning.
- Assigned facilitator reads and booking/acceptance/reschedule/cancellation.
- Two simultaneous overlapping bookings: one winner, consistent slot state.
- Elevated-risk submission: one durable alert even if the app exits or delivery retries.
- Parallel AI summary requests: one vendor request and a version-correct cache.
- Account switching/logout/offline/multi-tab tests without prior-user data exposure.
- Attachment validation, permission changes and download-link revocation in staging.
- Fault injection between Auth changes and audit persistence with reliable reconciliation.

Useful existing checks after implementing changes (PowerShell, start in `spartan-g`):

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build:web
npm.cmd audit --json
npm.cmd --prefix firebase/functions ci
npm.cmd --prefix firebase/functions run build
npm.cmd --prefix firebase/functions audit --json
```

Run the existing emulator-dependent suites through an explicitly installed Firebase CLI/emulator using a demo project and the appropriate test config; do not point them at production. Add the missing authorization/Storage tests before treating the security work as complete. Use actual device/simulator release builds for mobile/session/notification verification.

## Operational questions to verify before release

- Which rules and function revisions are actually deployed, and are any buckets/databases public through IAM or another policy?
- Who is authorized to be a facilitator, how are assignments approved, and is access cross-campus by design?
- Are staff/admin MFA, email-enumeration protection, password policy and allowed Auth domains configured?
- Are any service-account/download tokens exposed through shared archives, previous repositories, logs or backups?
- What hosting service serves production, and what security/cache headers does it send?
- What vendor data handling, access retention, deletion and incident-response policies apply to counseling records and generated summaries?
- Are Firebase/AI cost alerts, backup schedules and restore permissions configured and tested?

These require deployment/account evidence. The source findings above are actionable now and should be resolved before considering the application ready for sensitive counseling data.
