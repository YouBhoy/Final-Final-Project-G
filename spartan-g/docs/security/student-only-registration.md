# Student-only public registration

Implemented locally: October 12, 2026. Addresses the public facilitator-signup path in SEC-01 of the [security improvement plan](security-improvement-plan.md).

## Project context

SPARTAN-G is intended to extend an existing student portal. The standalone account-creation flow was added to make development role testing easy; it is not the intended production enrollment system. The production integration should obtain authenticated identities and trusted role assignments from the existing portal, with server-side verification. No portal session/token exchange or SSO integration was found in the reviewed website/backend source; its authentication protocol still needs to be established before choosing an implementation.

Keep development account provisioning confined to an emulator or explicitly isolated test environment. This signup patch closes a currently exposed privilege path, but a larger self-service registration/approval system is not the next priority for the extension. Next, enforce who can access each student's records, appointments, conversations and attachments, regardless of how the user signs in.

## Behavior

- Public website registration offers student accounts only.
- The website registration service rejects facilitator, super-admin and unexpected roles before creating a Firebase Auth account.
- Firestore enforces student-only self-creation independently of the client, with an exact field allowlist, matching UID, required profile fields and server timestamps.
- Existing rules continue to prevent students from changing their role or activation state.
- Existing active super administrators can still provision accounts through their authorized rule path; trusted Admin SDK provisioning remains available. Existing facilitator login/access is not revoked by this change.

This change does not add an invitation/approval UI or validate an existing staff roster. For development, test staff identities must be provisioned through a trusted administrator/backend or emulator fixtures; the public signup form cannot be used for staff enrollment. Existing facilitator login is expected to work: the patch restricts self-registration, not authorized staff sign-in.

This branch is for the website. Mobile UI/service changes are handled on the mobile branch. Firebase rules apply to every client using the database where those rules are deployed, including older mobile clients.

## Validation

From `spartan-g`, using Node and Java on PATH:

```powershell
npm.cmd run typecheck --workspace=@spartan-g/web
npm.cmd run build:web
npm.cmd --prefix firebase/functions run test:registration-clients
npm.cmd --prefix firebase/functions run build
firebase.cmd emulators:exec --only firestore --project demo-spartan-booking --config firebase.booking-test.json "node --test firebase/functions/test/registrationRules.test.mjs firebase/functions/test/studentProfile.test.mjs"
```

Rule tests cover successful student creation, privileged self-signup denial (active and inactive), anonymous/cross-user creation, forged UID/extra fields, missing fields/timestamps, role/activation updates, authorized admin provisioning, and denied provisioning by disabled admins or facilitators. Client tests execute registration functions with Firebase doubles to check early rejection and normal student signup. Existing profile tests check student restrictions and legitimate staff/admin profile actions.

Website typecheck and production build pass. All 2 website registration tests and all 21 combined registration/profile emulator tests pass, as does the Firebase Functions build. Website typecheck/build validation uses the website workspace, rather than repository-wide checks that include the separate mobile application. The TopNav compilation error was fixed by adding the optional navigation group field to the shared website navigation-item interface. Vite reports nonblocking bundle-size and mixed static/dynamic import warnings.

## Rollout

These edits do not change deployed Firebase rules or deployed clients until released.

1. Verify the target test/staging project and deploy the revised website and production Firestore rules there. Never use the open smoke-test rules.
2. Exercise actual Auth signup plus creation of `users` and `profiles` through the website. Verify direct staff self-creation is denied, including from older clients, and verify a trusted-provisioned facilitator can sign in.
3. Build/release the website and deploy the reviewed rules to the intended project after these checks pass. A stale client may still display the removed choice, but the new rules deny its staff creation attempt; plan user-facing handling for Auth accounts left without profiles by old clients.
4. Verify student signup and provisioned staff login after deployment. Assignment-scoped facilitator access (SEC-02) is now implemented locally; follow its [coordinated rollout notes](facilitator-assignment-access.md) when releasing these changes together.

The system is currently under development, so reviewing a production staff roster is not a release requirement for this change. Before using real staff/student data, validate the legitimacy of privileged accounts.

Do not relax the production rules to accommodate an old facilitator-signup client. Complete staff provisioning separately instead.
