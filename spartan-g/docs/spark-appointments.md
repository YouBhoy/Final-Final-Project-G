# Appointment booking on Spark

Booking, student rescheduling and facilitator acceptance now use the Firestore client SDK;
they do not call Firebase Cloud Functions. Shared services use the same path for web and mobile.
The logged-in Firebase Auth identity and deployed Firestore rules authorize each operation.

New requests are 60 minutes, beginning on the hour or half hour, within the current week
(today through Saturday, Asia/Manila), and later than the rule server's current time.
The booking UI still displays the facilitator's work hours. Rules enforce the time window,
active participant roles, duration, ownership, field whitelist and reservation requirements.
Work-hour checks remain UI guidance, as in the previous backend implementation.

Each request atomically writes an appointment, two facilitator half-hour reservations, two
student half-hour reservations and its notification. Reservation IDs identify the participant
and interval. Every reservation is read in the transaction and validated with getAfter in rules.
Overlapping concurrent transactions cannot both commit, including a student booking different
facilitators. Browser writes that omit a reservation or attempt to overwrite a live reservation
are rejected even if application validation is bypassed.

Reservation documents contain only participant ID, kind, slot number and appointment ID.
They contain no appointment notes. Active users can read reservation metadata.
Reservations can be reused only if the referenced appointment no longer occupies that interval:
cancellation, completion, no-show, reschedule request, rescheduling away, or trusted deletion.
Stale reservation documents are intentionally retained. No separate cleanup write is required
to release a time. Client reservation deletions are denied.

Acceptance atomically marks the request accepted, grants the canonical facilitator/student
relationship, creates the canonical conversation if absent, and notifies the student.
Rules require a genuine requested appointment assigned to the acting facilitator, or an active
super admin, and active participants. Updating appointment status alone cannot grant acceptance.
Retries of already accepted appointments do not restore administrator-revoked relationships.

## One-time migration

The maintenance script validates all existing active intervals and backfills their occupied
half-hour blocks, including older irregular start times and durations. Invalid records or shared
blocks abort before writing. Original appointment records remain unchanged.

From `spartan-g`:

```powershell
node scripts/migrate-appointment-reservations.mjs
node scripts/migrate-appointment-reservations.mjs --apply
firebase.cmd deploy --only firestore:rules --project spartan-g-a2d80
```

The script uses the existing ignored scripts/service-account.json credential. The apply command
writes appointment_booking_config/spark version 1 only after every reservation is saved.
Client booking stays disabled before this gate. The apply command refuses to rerun once enabled;
do not run a migration concurrently with active booking clients. Partial failures can be retried
before the gate is enabled. Rollback requires disabling the gate through a trusted Admin SDK tool
before restoring older rules/code.

## Verification

Run `npm.cmd run test:appointments:spark` for emulator-only tests of actual browser transactions,
simultaneous requests, half-hour overlaps, student conflicts, cancellation/reuse, rescheduling,
legacy blockers, active accounts, forged direct writes, acceptance permissions and atomicity,
administrator acceptance and existing facilitator access/privacy regressions.
Integration tests require at least three future bookable hours before Sunday Manila time.
Run web and shared-services typechecking after changes.

The older Cloud Function source remains for regression tests but its appointment handlers are
no longer exported for deployment. The appointment service no longer invokes them. Do not
re-export them without adapting them to reserve the same intervals; their Admin SDK writes
bypass client reservation rules.
