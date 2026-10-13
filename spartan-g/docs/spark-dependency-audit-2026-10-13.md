# Spark dependency audit — October 13, 2026

Update after the audit: the three appointment callables described below have now been replaced
with client Firestore transactions and deployed reservation rules. Ten existing active appointments
were backfilled into 40 reservations. See spark-appointments.md. The remaining active callable
dependencies are the three admin account/profile endpoints and the AI summary endpoint.
The findings below record the source state at the time of the original audit.

Scope: application source in apps/web, apps/mobile, shared packages, Firebase backend exports,
Firestore rules, launch/configuration files, and maintenance scripts. Dependencies, generated
bundles, and credentials were excluded from source searches. This is a source/dependency audit,
not an end-to-end test of every screen. Earlier live CLI inspection in this session confirmed
zero deployed functions in spartan-g-a2d80; deployment was rejected because Blaze is required.

## Remaining active Cloud Function dependencies

Seven distinct callable endpoints remain in application code. Each requires a deployed backend;
the current project's absent endpoints make these actions fail. Error presentation varies.

1. **Student appointment booking — requestAppointment.**
   packages/shared-services/src/services/appointment.service.ts:94;
   apps/web/src/pages/student/StudentBookAppointmentPage.tsx:167.
   Booking currently depends on a server transaction for overlap and authorization checks.
2. **Facilitator appointment acceptance — acceptAppointment.**
   Same service, line 110; apps/web/src/pages/facilitator/FacilitatorAppointmentsPage.tsx:61.
   Acceptance also grants the authorized facilitator/student relationship.
3. **Student appointment rescheduling — rescheduleAppointment.**
   Same service, line 166; apps/web/src/pages/student/StudentAppointmentsPage.tsx:164.
   This is distinct from the facilitator's requestReschedule action, which uses direct Firestore writes.
4. **Admin password changes for another account — adminSetUserPassword.**
   packages/shared-services/src/services/admin.service.ts:106;
   apps/web/src/pages/admin/AdminUserDetailPage.tsx:244.
   Requires trusted Firebase Auth administration. A browser cannot safely replace the Admin SDK.
5. **Admin display-name changes — adminUpdateUser.**
   Same service, line 131; AdminUserDetailPage.tsx:169.
   Synchronizes Firebase Auth and Firestore. Profile saving can fail here before subsequent edits run.
6. **Admin student profile edits — adminUpdateStudentProfile.**
   apps/web/src/lib/adminStudentProfile.ts:75; AdminUserDetailPage.tsx:182.
   Campus, bio, phone, institution, pronouns and gender changes use this endpoint.
   Non-student profile fields have a separate direct-Firestore path.
7. **Facilitator assessment AI summaries — generateAssessmentSummary.**
   apps/web/src/components/assessment/AiSummaryCard.tsx:58;
   apps/web/src/pages/facilitator/FacilitatorStudentsPage.tsx:221.
   Automatically requested for completed attempts. Also depends on the GEMINI_API_KEY backend
   secret and an external Gemini model request. The summary card catches errors; this does not
   prove that the whole student detail screen fails.

The appointment rules in firebase/firestore.rules:271 explicitly deny client creation and protect
backend-managed changes. Replacing the three calls with ordinary client writes will not work
without a carefully designed rules/transaction migration.

## Other backend exports

firebase/functions/src/index.ts exports eight callable functions and one document trigger.
The two callables without active frontend invocations are:

- getPublishedAssessmentDefinitions: superseded by the Spark-compatible assessment_catalog loader.
- superAdminOverrideAttempts: the web override UI already writes directly under validated admin rules.
  The comment in the shared override service still describes backend-only writes and is outdated.

onMessageCreate is a Firestore trigger, not a browser callable. It sends FCM push notifications
to conversation recipients and updates conversation.updatedAt. Without deployment those push
notifications are absent. Core message writes, previews and unread counts use client Firestore
transactions; absence of the trigger does not itself stop in-app message sending.

## Firebase Storage dependency

Admin resource file creation/replacement uses resourceService -> storageService.uploadFile ->
Firebase Storage. File deletion also invokes Storage (resource.service.ts:227).
AdminResourcesPage.tsx:157 and :167 are active UI callers. URL-only resources avoid uploading
a file; existing Firebase Storage URLs still depend on access to their bucket.

userService.uploadAvatar also uses Storage, but no application caller was found in this audit.
Treat it as an available service dependency, not a confirmed broken active avatar UI.

Earlier project setup documentation reports Storage was not initialized because billing was required.
No upload or deletion of live files was attempted during this audit. Firebase's current policy
requires Blaze for Cloud Storage, including continued default-bucket access starting February 3, 2026.

## Cloud services that are not inherently a Blaze blocker

Firebase Authentication, direct Firestore operations, static Firebase Hosting, and client FCM
registration should not be removed merely because they are cloud services. They can be used on
Spark subject to supported features and quotas. Their permission/index/configuration failures
are separate from missing Cloud Functions.

Current assessment listing uses assessment_catalog. Assessment taking/submission, statistics,
attempt-limit overrides, core messaging and many dashboard reads use direct Firestore paths;
no callable dependency was found in those paths. This is not a guarantee that every query,
permission, or data condition succeeds.

Trusted maintenance scripts use firebase-admin locally. That SDK does not itself require a
deployed Cloud Function. The assessment catalog sync remains a manual maintenance command
after publication changes; stale catalog metadata is a synchronization issue, not a billing error.

start-system.bat starts only Vite. It starts neither a local backend nor Firebase emulators.
The web emulator switch connects Auth, Firestore, Storage and Functions together; turning it on
without those emulators and seeded users would introduce additional failures. Emulator mode
can support local testing without Blaze, but is not a deployed-production replacement.

## Suggested Spark migration order

1. Redesign appointment booking/acceptance/rescheduling with atomic slot ownership and rules
   enforcing roles, ownership, state changes and relationship grants. Preserve race protection.
2. Move permitted admin student Firestore profile edits to validated, audited direct writes.
   Decide separately how Auth display-name synchronization and other-account passwords will
   be managed through a trusted local tool or another backend. Do not ship Admin SDK secrets
   to the browser. Self-service password-reset email is an alternative workflow, not equivalent
   to an admin setting another user's password.
3. Make AI summaries optional until a trusted backend is available, or supply a clearly labeled
   deterministic score summary. Do not place the Gemini secret in frontend environment variables.
4. Use external resource URLs while on Spark, or choose an alternative upload backend.
5. Address push notification delivery after core user workflows are repaired.

No runtime implementations were changed as part of this audit.

## Firebase policy sources

- Cloud Functions deployment requires Blaze; local emulation is allowed:
  https://firebase.google.com/docs/functions/get-started
- Cloud Storage billing requirements:
  https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- Spark and Blaze service availability:
  https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
