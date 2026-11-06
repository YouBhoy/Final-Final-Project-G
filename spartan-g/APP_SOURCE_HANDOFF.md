# Android source handoff — November 6, 2026

This App-branch source snapshot is for teammate review. The verified installed presentation APK is v31 (`com.spartang.mobile`, version name `1.0.0`). It is not a new APK release or authorization to deploy any service. Main and web-only working-tree changes are excluded from this handoff.

## Included source

- Current Android/Expo UI, dashboard artwork, approved PNG mascot, animated flag, More button, Garden/Forest compatibility, Profile/Settings consolidation, permission/channel controls, monochrome notification icon, privacy consent, screenshot protection and secure logout.
- Required shared services/types and dependency-lock updates, including the canonical atomic message-outbox writer.
- Prepared notification registration/ownership/event/transport code and disabled staging backend sources. No keys, device tokens, real student records, APKs, generated Android outputs or historical diagnostic archives are included in this commit.

Production Firebase client configuration remains `spartan-g-a2d80`, default Firestore database. The existing checked-in `google-services.json` files are public Android client configuration, not Admin credentials. Native/JavaScript configuration must be checked together for any later release. The normal local `.env` files are intentionally not published; obtain the required public client settings through the owner, never copy privileged credentials into an APK.

Automatic production push remains source-disabled (`PRODUCTION_PUSH_ENABLED=false`, no installed production transport). The Firebase staging release gate, hosted message-discovery gate and outbox-hosting gate remain false. The private FCM test is an explicit owner-operated interface, not automatic delivery. Assessment submission must remain disabled in approved presentation configuration. Do not enable environment flags or deploy prepared infrastructure as part of code review.

## Message writer and web-owner integration

The App shared writer now commits three records atomically: `messages/{autoId}`, the conversation metadata/unread update, and `notification_outbox/message_<autoId>`. Outbox metadata has six fields only: schema version, kind, message ID, conversation ID, sender ID and server creation time. It includes no private body, attachment, recipient list, token or processing state.

**Do not run or release this paired writer against live Rules that reject the outbox.** Such Rules reject the entire message transaction. A separately reviewed transition Rules configuration must be introduced before updated writers are used. Transition Rules keep old APKs and unmodified web writers messaging, but those writers produce no event. Do not claim lossless automatic notifications for them. Strict Rules reject legacy writers and must wait until all relevant writers are updated and verified.

The Main owner should review the shared writer/helper addition against Main's own current source and preserve Main-specific behavior. Do not merge App wholesale or replace Main's messaging service with App's file. Full web TypeScript/build/messaging/in-app checks remain owner work. Retain transition Rules while legacy clients remain; never force all students to update implicitly. Backend activation, credentials, rules publication and a synthetic end-to-end pilot require separate approval.

## Validation and release boundary

Install project dependencies using the checked-in workspace manifests/lockfile in an owner-approved development environment. Mobile validation is `npm run typecheck --workspace=@spartan-g/mobile` from `spartan-g`. Backend preparation has separate no-emit TypeScript configurations under `functions/notification-*`; none is a deployment command.

Local Sprint 3 evidence recorded 296 passing selected checks and zero mobile TypeScript diagnostics. The historical shared messaging test harness has 16 inherited failures from an unrelated missing risk-alert dependency mock. Native behavior and all supported Android versions still require separately authorized device testing; static source checks are not proof of APK runtime behavior.

Protected launchers remain fail-closed. Their local historical source manifests, signing inputs and private build evidence are intentionally not part of this handoff. The prior v31 manifest already differs from newer reviewed work; this source needs a separately authorized manifest/input review and release preflight before another protected build. Never regenerate a manifest blindly, bypass its guards or reuse the old APK authorization. No build or signing is authorized by this commit.

If a later rollout needs rollback, stop the approved backend control first. Restore compatible transition Rules under separate cloud approval before rolling back any writer from strict mode. Preserve outbox/attempt ledgers and unknown outcomes; never replay an ambiguous send. Preserve installed app data, existing APKs and the established signing identity.
