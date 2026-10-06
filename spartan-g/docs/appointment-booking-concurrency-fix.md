# Appointment booking concurrency fix

Implemented on `main`; the `app` branch has not been changed.

## Behavior

`requestAppointment` and `rescheduleAppointment` are callable Cloud Functions.
They derive the student identity from Firebase Authentication, validate active
student/facilitator accounts, and transactionally read existing appointments.
Every booking transaction reads and writes a private per-facilitator lock
document, including when no appointments exist yet. Concurrent overlapping
requests therefore cannot both commit. Intervals are half-open: an appointment
may begin exactly when the preceding one ends.

Existing requested/accepted appointments are included without a data migration.
Cancelled and other inactive statuses release availability. Query failures abort
booking. Notifications commit with appointments. Rescheduling updates the original
appointment; it never falls back to creating a second record.

Firestore rules deny direct creation, changes to appointment identity/time/duration,
and reactivation of inactive appointments. Existing acceptance, cancellation,
completion, notes, and reschedule-request operations retain their status paths.

## Verification

From `spartan-g` in PowerShell:

```powershell
npm.cmd --prefix firebase/functions run build
firebase.cmd emulators:exec --only firestore --project demo-spartan-booking --config firebase.booking-test.json "npm.cmd --prefix firebase/functions run test:booking"
npm.cmd run build:web
```

Seven tests cover concurrency, legacy appointments, adjacent intervals,
reschedule collisions, cancellation, authorization/input validation, failed reads,
and rules denying bypass writes. Tests refuse to run without the emulator.

## Rollout

Nothing has been deployed by this change. Deploy the two new functions first,
update clients, and then deploy the Firestore rules. The Firebase configuration
now builds functions before deployment and includes the compiled `lib` directory.

The mobile `app` branch must adopt the same callable booking/rescheduling service
before these rules are deployed to its shared Firebase project. Older clients
that write appointments directly will be denied by the new rules. Protection is
fully enforced only after the rules are deployed; deploying functions alone
leaves the old write path available.

The overlap query currently reads all appointment records for a facilitator.
This favors compatibility with existing data and avoids a required composite
index. For large historical datasets, replace it with bounded indexed queries
while retaining the shared lock and transaction reads.
