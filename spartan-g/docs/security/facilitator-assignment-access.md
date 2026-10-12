# Facilitator access through approved student assignments

Implemented locally: October 13, 2026 (Asia/Manila). Website branch only; no mobile screen changes, production data changes or deployment were performed.

## Access policy

A facilitator can access a student's private records only when the canonical relationship document `facilitator_student_links/{facilitatorId}_{studentId}` has matching identities and `status: accepted`. Active super administrators retain their administrative access. Students retain their existing access to their own records.

This policy covers student user/profile documents, assessment instances, responses, attempts, AI summaries, attempt overrides, enrollments and submissions. Risk alerts additionally require the alert's named facilitator to match the caller. Facilitators can read/action only their own appointment records, including incoming requests before assignment approval. Pending requests do not expose a student's private profile; the appointment page uses a generic student label until access is approved.

Student/assessment identities are frozen on student and facilitator updates, so a client cannot move an existing record to another student or definition to bypass the access policy. New student-created assessment instances cannot set the publication flag. Even an incorrectly published student instance remains private. Published definitions remain readable individually; student/facilitator assessment lists and the student dashboard use a server-projected definition list rather than reading the mixed collection.

## Approval paths

The current website grants a relationship when a facilitator accepts a student's appointment request. This workflow is preserved:

1. Booking continues through the existing server-authorized booking function.
2. The website calls the new `acceptAppointment` callable with an appointment ID. Client-provided facilitator identity/role is not used by the backend to grant access.
3. The server transaction checks the caller is active staff, the caller is the named facilitator or a super administrator, the stored booking is requested, and both participants have the required active roles.
4. The transaction accepts the booking, creates/updates the canonical relationship, ensures a two-person conversation with exactly those participants, and writes one deterministic notification.
5. Retrying an already accepted booking does not duplicate notifications or restore a subsequently revoked relationship. A malformed relationship/conversation causes the transaction to abort before any writes.

Direct client appointment acceptance is denied. This prevents an old client from accepting a booking through the previous permissive transaction.

The rules also support explicit relationship requests: an active student may create only their own canonical pending request with a server request timestamp. Only the named facilitator can accept/reject a pending request, or a super administrator can manage its status. Neither students nor unrelated facilitators can self-approve or change identities. No separate request/approval UI was added because the website currently uses appointment acceptance.

## Website and backend changes

- `apps/web/src/lib/facilitatorAccess.ts` loads accepted relationship IDs first, then reads only those student records. Risk queries constrain both student and facilitator, with optional open status. Added corresponding composite indexes.
- Facilitator student, risk-alert and dashboard pages use these scoped queries. The student list shows an assignment-specific empty state.
- `firebase/functions/src/appointmentAcceptance.ts` implements trusted transactional acceptance; `appointmentFunctions.ts` exports the callable.
- The shared appointment service used by the website calls the server acceptance function rather than writing approvals in the browser. Mobile files are unchanged, but clients in another branch using the same database must adopt the callable before rules rollout.
- `firebase/functions/src/studentAccess.ts` checks active staff and the matching accepted relationship. AI summary generation invokes it before returning a cache hit or calling the provider. Direct summary reads check the authoritative attempt's student identity.
- `firebase/functions/src/assessmentDefinitions.ts` exposes the `getPublishedAssessmentDefinitions` callable to active users. It excludes any student-owned instance and returns only definition/question/option fields. This preserves assessment browsing without allowing publication flags or unrelated metadata to expose private records.
- Firestore rules enforce the same assignment scope for direct SDK/REST requests. A rejected/deleted relationship denies subsequent record requests and summary generation, including cached results. Previously downloaded data is not remotely erased from a browser's memory/cache; session/cache hardening remains separate work.

## Validation

Website typecheck, production build, backend build, 2 website registration tests and 74 combined emulator tests pass. The initial parallel multi-suite run encountered an emulator transaction error in an existing booking concurrency test; the sequential suite run passed while retaining each test's internal concurrent booking calls. The override-read test was updated to require an assignment for facilitator access.

The new assignment tests cover:

- Forged accepted requests, foreign student IDs, noncanonical link IDs and unrelated approval attempts.
- Authorized approval, immutable relationship identities and active administrator provisioning.
- Assigned reads versus unrelated/disabled staff reads and deletion attempts across protected collections.
- Actual scoped Firestore queries versus rejected global or foreign queries.
- Immutable student record identities and denied unrelated staff updates.
- Concurrent appointment acceptance, exactly one notification and transactional rollback.
- Cached/forced AI-summary denial for unrelated staff and denial after revocation, without contacting the AI provider.
- Private assessment instances remain protected even with an incorrect publication flag; definition lists exclude private instances and unrelated metadata.

From `spartan-g`, with Node and Java 21 on PATH:

```powershell
npm.cmd run typecheck --workspace=@spartan-g/web
npm.cmd run build:web
npm.cmd --prefix firebase/functions run build
npm.cmd --prefix firebase/functions run test:registration-clients
firebase.cmd emulators:exec --only firestore --project demo-spartan-booking --config firebase.booking-test.json "node --test --test-concurrency=1 firebase/functions/test/facilitatorAccess.test.mjs firebase/functions/test/registrationRules.test.mjs firebase/functions/test/studentProfile.test.mjs firebase/functions/test/appointmentBooking.test.mjs firebase/functions/test/assessmentOverride.test.mjs"
```

Manual validation in a test deployment should use facilitator A/B and student A/B. Book each student with their respective facilitator. Before acceptance, their private record should not appear. After acceptance, A should see only student A and B should see only student B. Complete an assessment, open its summary with the assigned facilitator, and verify the unrelated facilitator cannot fetch its document or call the summary function. Revoke the relationship through trusted test setup and confirm subsequent reads/summary requests fail. Verify the administrator still sees both. These browser checks have not been performed against a deployed system during this change.

## Rollout and existing test fixtures

Deploy the new acceptance and published-definition callables and revised summary callable, the revised rules/indexes, and the website as one coordinated test release. Functions and indexes should be ready before the new website/rules depend on them. The existing app is a development extension, so external portal authentication integration remains future work.

Use trusted test setup for initial accepted assignments. A facilitator account alone no longer makes every student visible. Existing accepted bookings without a valid canonical relationship do not automatically grant access; approve/recreate legitimate development assignments deliberately. Do not automatically turn every historical booking or malformed link into an accepted assignment. Review any development relationships created under the previous permissive rules before using them as trusted fixtures.

Because Firebase rules are shared by all clients of a database, older clients that still perform browser-side acceptance or global student/risk queries will be denied until updated. Do not add permissive fallback rules for them.

## Remaining security work

This implements assignment-based staff access, not the entire security roadmap. Student availability checks still read active appointment documents and need a minimal availability projection. Message creation/membership and Storage attachment/submission privacy still need their own rules changes. Server-authoritative assessment scoring/alert generation, cache handling, dependency upgrades and portal identity integration remain separate work.
