# Student and facilitator access hardening

These changes have been tested locally with synthetic accounts and the repository's release rules. They have not been deployed to the live Firebase project.

## Changes

- Students can read their own private appointments; the booked facilitator and super admins retain access. Availability uses a separate scheduling projection containing only facilitator ID, time, duration and status.
- Appointment creation, acceptance, and repository updates maintain that projection. Once its migration gate is enabled, rules require updates to keep the private and public scheduling fields in sync.
- Notification writers need an accepted student/facilitator connection or a related appointment between the sender and recipient. Owners can mark notifications read without rewriting or transferring them.
- New conversations require an active student and facilitator with an accepted connection.
- Students cannot reserve another student's slot or modify slot ownership/time while reserving. Facilitators cannot transfer slot ownership, and cannot read other facilitators' reserved slots.
- Assignment-file access is restricted to its owner, the assigned active facilitator, and active super admins. Unrelated facilitators cannot delete those files.
- Resource-file downloads follow the publication and audience restrictions on the corresponding resource record, including facilitator-only resources and inactive drafts.
- Deactivated accounts cannot read or edit their profiles. The shared web session listener also removes access when a role/account changes.

## Availability migration and deployment

Do not enable the new availability UI on production without preparing its public scheduling records. It deliberately refuses to display an incomplete calendar until the migration finishes.

1. Use a maintenance window with appointment writes paused; deploy the updated rules and appointment clients together. Older clients cannot make scheduling changes after the availability gate is enabled unless they also synchronize the projection.
2. With the existing trusted local service-account setup, run `node scripts/migrate-appointment-availability.mjs` for a dry run. The script checks the expected project and validates scheduling records before writing anything.
3. Review the dry run, then run the same command with `--apply`. It copies only the four public scheduling fields and sets `appointment_booking_config/spark.availabilityVersion` to `1` last.
4. Confirm student booking, facilitator acceptance, cancellation and rescheduling, then reopen appointment writes.

The migration has not been run against live data. Existing Firebase download-token links are bearer links; changing Storage rules does not invalidate links previously shared or exposed.

## Repeatable tests and remaining issue

Run `npm run test:portal-security` from `spartan-g`. This builds the function handlers and uses local demo emulators only. The suite includes unauthorized reads/writes, private-file access, appointment races, real client booking/acceptance, cross-portal routes and session revocation.

**SEC-004 has a Spark-compatible fix:** students save responses only. Rules block derived risk/grade fields on attempt creation and limit their later edits to answers, submission status and timestamps. Submitted answers cannot be changed by a student. The assigned facilitator's session recomputes risk from saved responses when loading/refreshing alerts, ignoring legacy risk labels supplied by a student. Alert creation uses deterministic IDs and a transaction, so concurrent refreshes do not duplicate alerts or reset acknowledgement/resolution. Missing, malformed, partial or unsupported instruments produce a review item without a numeric score.

This requires updated web/mobile clients and Firestore rules to be released together. Old student clients that still write derived risk fields will be rejected by the hardened rules. No Cloud Functions or billing upgrade is added. Alerts are generated when the authorized facilitator opens or refreshes the relevant view; this is not an always-on server monitoring service. Calculations cannot establish whether self-reported answers are truthful and do not verify medical/clinical accuracy. These changes are not a complete platform security audit.
