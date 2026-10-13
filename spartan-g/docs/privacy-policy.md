# Web privacy agreement

Students and facilitators must accept the privacy policy after signing in or creating an account
before interacting with any portal route. Their dashboard is visible behind a translucent overlay,
with blur, but is inert and hidden from assistive technology until acceptance. Users must select
the agreement checkbox before I Agree is enabled; it resets at each new sign-in. The requested route does not
mount until accepted. Direct portal links pass through the same gate. Super admins
are exempt so they can manage the policy. Deny, the agreement's close button, and Escape sign
the user out. Closing the separate policy reader returns to the agreement. Denying after signup
leaves the newly created account intact.

Super Admin > Privacy Policy (`/admin/privacy`) edits the plain-text title and body, shows a
preview, and publishes to `platform_settings/privacy_policy`. The agreement presents the
non-diagnostic purpose as its main body; its Privacy Policy link opens a separate popup containing
the editable published text. Closing that reader returns to the agreement without accepting or
signing out. Body text preserves paragraph
breaks and is never interpreted as HTML. The starter text is shown until an administrator first
publishes a policy. Changes apply to the next sign-in; existing accepted sessions are not interrupted.
Concurrent edits use a version check to prevent silently overwriting another administrator's changes.

Acceptance is stored in this browser tab's session storage and tied to the Firebase user's UID
and last sign-in time. Refreshing an accepted session does not prompt again. Explicit login,
signup and logout clear the marker; a new sign-in gets a new marker. If browser storage is
disabled, acceptance works in memory and a refresh prompts again. This is a web portal entry
gate, not a permanent consent flag on the user record or a change to the mobile app.

Policy reads require an active account; writes require an active super admin. Rules validate
nonblank title/body, lengths, revision increments, author and server timestamp. Clients cannot
delete the policy. A failed policy read leaves Accept disabled, with Retry and Deny available.
No Cloud Function or Blaze billing upgrade is needed.

Verification: `npm.cmd run test:privacy --workspace=@spartan-g/web` covers the actual gate with
mocked auth/policy dependencies. The Firestore emulator facilitatorAccess.test.mjs suite covers
read/edit permissions and policy validation alongside existing access-control regressions.
