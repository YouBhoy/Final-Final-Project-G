# Student support backend — local preparation only

Notification preparation now also includes the transaction/proof/event implementation in `notification-runtime.ts` and the **uninstalled** adapters under `functions/notification-preparation`. See [the current notification proposal](../../docs/android-notifications-integration-20261103/BACKEND_PROPOSAL.md). The older push planning notes below describe the original port-only baseline. Production registration, delivery, triggers and schedules remain disabled; the AI scope is unchanged.

`support-runtime.ts` is an injected server core, not a deployed function, running sender, public endpoint or production-ready transport. It has no credentials, SDK initialization or background jobs. Nothing imports it from the mobile application. Native AI and production push remain disabled.

The tests in `docs/student-feature-enhancements-20261103` execute the real core with synthetic ports. They do not contact a provider or send notifications.

**AI contract**

- Proposed authenticated POST body: exactly `{ "questionId": "navigation" | "garden" | "resources" }`. No UID, student text, conversation, screening data or clinical interpretation is accepted.
- The trusted server must enforce a small JSON body limit before parsing, HTTPS, an explicit project, Firebase Admin ID-token verification with revocation checking, enabled Authentication account, and the canonical active `users/{uid}` student role.
- `consume` must be an atomic distributed quota with owner-based limits, global budget and deny-on-failure behavior. No process-local permissive limiter is supplied.
- Only fixed public instructions reach the optional provider port. Provider output is bounded, rendered as plain text, and rejected for unsafe structure, contacts or clinical claims. These checks do not establish medical or legal safety; model evaluation and institutional approval are still required.
- Authentication, quota checks and generation have timeouts. A disabled, failed or unavailable provider returns a deterministic fallback with no retry and no raw exception or student logging.
- No provider SDK, endpoint URL or secret is configured. Do not enable the existing client-side Gemini prototype to bypass this backend boundary.

**Push contract**

Reuse the canonical source documents; do not write parallel assessment results or clinical records:

| Event | Source | Required server validation |
| --- | --- | --- |
| New facilitator message | `messages/{messageId}`, `conversations/{conversationId}` | Newly created message; active facilitator sender; active student recipient; exact conversation ID and both participants; current access still valid; suppress self-notifications/read events |
| Appointment status change | `appointments/{appointmentId}` | Valid before/after transition; exact student owner and facilitator; deduplicate the transition; generic content only |
| Appointment reminder | Same appointment | **Not implemented.** Requires reviewed scheduling, Philippine-time/lead-time policy, cancellation/reschedule suppression, deduplication and cost approval |
| Assessment publication | `assessments/{assessmentId}` | Actual unpublished-to-published transition and reviewed audience/recipient policy; never infer required assignments from a published questionnaire |

`canonicalPushAuthorized` checks minimal source projections and ownership/participants. `createPushDelivery` requires those fresh canonical checks both before and immediately before sending. The source reader, event-creation trigger and server authorizer must be wired together and independently reviewed; a caller-provided recipient is never authority.

Messages contain only the existing generic title/body, category channel and short-lived opaque event/binding envelope. No conversation text, UID, source path, screening result or risk is included. Android visibility is private. `firebaseMessage` serializes the six data values for FCM v1; the client decoder accepts only that exact envelope. The tap coordinator still requires an online authorized resolver and current device binding before navigating. These production ports are deliberately uninstalled.

**Unavoidable separate backend work before real delivery**

1. Select an approved hosting/runtime, cost limit and dedicated least-privilege keyless server identity. Validate Auth, Firestore and FCM project consistency. Do not reuse an APK credential or a browser secret. No paid runtime or new identity has been created.
2. Review a server-only registration/rotation/revocation API. Derive user ownership from verified Auth, not request fields. Verify installation/token association; handle shared-device transfers and outgoing-user cleanup before logout. Permission and policy acceptance must precede requesting the native FCM token.
3. Review metadata storage for device bindings, preferences, opaque events and per-event/per-binding delivery claims. These are **proposals, not created collections or an approved production schema**. Tokens must be server-only, absent from logs and tap payloads. Use soft revocation, expiry and an explicit retention policy.
4. Implement atomic binding replacement and distributed delivery/quota transactions. Preserve dedup claims after an ambiguous send. Do not automatically retry a timeout that may already have delivered.
5. Install canonical message/appointment event readers and an authenticated tap resolver. Resolve current ownership and destination server-side; never trust a URL/route from the push payload.
6. Wire `device-registration.ts` to the reviewed API and Expo native FCM token/refresh hooks. Call revocation when preferences are disabled, permission is revoked, a token rotates, or an account leaves. A failed cleanup remains pending and blocks registration under another account. No real binding/controller instance is installed now.
7. Review invalid-token handling, stale binding expiry, privacy of queued notifications, event suppression and delivery receipts. Scheduled reminders and assessment audience fan-out are not implemented.
8. Obtain explicit deployment/testing approval, validate in isolated staging first, and test foreground/background/locked/process-terminated behavior on Honor. Force-stop, battery restrictions, unavailable Google Play services and offline delivery cannot be guaranteed.

Do not turn on a Boolean to claim delivery. The current mobile `PRODUCTION_PUSH_ENABLED=false`, null binding and null resolver remain unchanged. Settings save local preparation choices and distinguish them from Android permission and actual server registration.

**AI privacy approval**

The web-compatible portal policy acknowledgement is not consent to send personal data to an AI provider. No personal-data AI processing is prepared here. Before any provider activation, review age eligibility, institutional approval, processing/retention, jurisdiction, safety evaluation and actual hosting/provider costs. Current Gemini terms restrict under-18-accessible API clients and prohibit sending sensitive/confidential/personal information to unpaid services: [official terms](https://aistudio.google.com/docs/terms).

**Android constraints**

Android 13+ requires runtime notification permission: [Android documentation](https://developer.android.com/develop/ui/compose/notifications/notification-permission). Force-stopped Android apps must be reopened before notifications resume; device battery restrictions may also interfere: [Expo behavior](https://docs.expo.dev/push-notifications/what-you-need-to-know/), [delivery handling](https://docs.expo.dev/push-notifications/receiving-notifications/). These are delivery limits, not reasons to weaken app-lock or policy gates.
