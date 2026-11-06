# Local Main outbox integration review

Reviewed November 6, 2026 (Asia/Manila), against Main `3245e97926a5a38fdd2e080cb5488da3a5745f73` and `docs/web-owner-outbox-review-20261106.zip`.

## Decision

The minimal writer integration and Main transition Rules candidate pass local review. No blocking findings remain for this local integration. This is not approval to merge, publish Rules, release clients, or activate notifications. Strict Rules remain deferred while legacy writers are supported.

The active checked-in `firebase/firestore.rules` and Firebase configuration are unchanged. **Do not use this updated writer against a live database until separately approved compatible transition Rules are in place:** the old Rules reject the outbox and therefore the entire message transaction. Do not fall back to a message-only write.

## Local changes

- Applied the package's minimal `MAIN_WEB_OWNER.patch`: helper import, deterministic outbox reference outside the transaction callback, event write inside the existing transaction, and the new shared helper file.
- Confirmed the resulting writer/helper and the existing confirmation hook/caller match the tested package sources after line-ending normalization. The original writer and Rules baselines also matched this checkout after line-ending normalization. Every package-manifest hash verified before extraction was used.
- Preserved the sixth identity-recipient argument, target validation, atomic consent, canonical message payload, conversation/unread changes, and existing best-effort in-app notifications.
- Updated the existing `sparkAppointments.test.mjs` import boundary to load the real helper. Extended its real-client/emulator messaging check to inspect exact outbox fields and common message/event timestamps and ensure a rejected later send leaves no extra event.
- Fixed an unrelated stale `registrationClients.test.mjs` fixture discovered during broader validation: it omitted the existing tab-session and persistence dependencies. The test now checks memory-to-session persistence and the tab-session grant. No authentication application code changed.
- Existing unrelated working-tree changes were preserved. No commits, merges, deployments, APK builds, cloud Rules changes, or notification activation were performed.

## Final validation

All final runs passed, with 320 passing tests and no skipped or failing tests:

- All `apps/web/test/*.test.mjs`: 74.
- Referral/statistics, training, catalog and captcha-server supporting tests: 56.
- Assessment summary, booking window, registration-client and hosting-header tests: 13.
- Packaged outbox unit/confirmation/notification-core tests: 33.
- Packaged Main transition emulator suite: 30.
- Packaged Main strict emulator suite: 30.
- Original Main consent writer under transition/strict Rules: 2 each, 4 total.
- Main portal Rules/security, registration, facilitator access, statistics access and actual messaging/consent integration with the transition candidate: 69.
- Actual web imports and assessment flow through Vite, using the repository's intended isolated smoke configuration: 11.

Additional successful checks:

- `npm.cmd run typecheck --workspace=@spartan-g/web` (zero diagnostics).
- `npm.cmd run build:web:production` (TypeScript and Vite build, main-project configuration validation, emulators disabled in the build).
- `npm.cmd --prefix firebase/functions run build` (zero diagnostics).
- `git diff --check` for the integration changes.

The initial broader test run exposed the stale registration fixture, which was corrected and rerun. An initial combined Rules/smoke invocation incorrectly supplied restrictive Rules to the deliberately unauthenticated smoke fixture; security and smoke were rerun separately under their intended configurations and passed. Some existing SDK handles required Node's `--test-force-exit`; final emulator runs also used `--test-timeout=60000`.

This environment uses Node 24.15.0 rather than the package's stated Node 22. The pinned Firestore 1.22.0 JAR hash verified as `9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c`; it was used for the packaged outbox suites. Existing portal/smoke suites used the installed Firebase CLI's cached Firestore 1.21.0 and Storage Rules runtime. All owned emulators were stopped.

Vite reports a non-fatal bundle-size warning (main JS chunk about 1.28 MB before gzip). No browser interaction or Android device-display test was performed; Vite import smoke checks and React test harnesses are not a manual UI session.

## Evidence and reproducibility

The ZIP remains unchanged. Verified extracted package, local emulator configuration, downloaded pinned JAR, supporting App source files and logs are under `../tmp/web-owner-outbox-review-20261106/` relative to `spartan-g`.

Final evidence files in that directory:

- `web-typecheck.log`, `web-build.log`, `functions-build.log`.
- `web-tests.log`, `web-support-tests.log`, `web-additional-tests.log`, `outbox-unit-local.log`.
- `main-web-emulators-final.log` and `web-smoke-final.log`.
- `docs/message-outbox-sprint4-20261106/MAIN_TRANSITION_FINAL/tests.log` and `MAIN_STRICT_FINAL/tests.log`.
- `local-emulator-runs/MAIN_TRANSITION_LEGACY/tests.log` and `MAIN_STRICT_LEGACY/tests.log`.

The packaged runner's count parser expects TAP (`# pass N`), but Node 24 defaults to the spec reporter for this invocation. Its RESULT.json therefore reports zero counts even though exit status is successful and logs show 30/30 or 2/2 passing. Counts above were checked against the test logs. For future runner compatibility, add `--test-reporter=tap` to its child test command; this is a reporting issue, not a Rules failure. The original package was not edited.

The supporting App sources were read from local `origin/app` into the isolated extracted package only. They were not copied over Main services. Main writer snapshots used by the package were verified against the actual integrated source. Package tests that inspect prepared backends do not activate those backends.

## Release dependencies retained

Review a fresh deployed-Rules baseline under separate authorization before preparing any cloud change; the saved snapshots in this package do not establish current deployed contents. Preserve intervening privacy and consent policies. Publish compatible transition Rules before releasing updated writers. Legacy clients remain functional but do not provide universal outbox capture. Backend hosting, credentials, activation and a synthetic push pilot still require their own approvals.

If strict enforcement is considered later, verify all relevant writers first. For rollback, stop backend delivery controls first and restore compatible transition Rules before rolling a strict writer back. Preserve outboxes, consent, queues and ambiguous send outcomes. No application retry or semantic resend deduplication was introduced by this integration.
