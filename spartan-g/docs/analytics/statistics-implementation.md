# Statistics implementation and testing

The website's `/admin/statistics` route contains Participation, Trends and Assessment Scores tabs. Reports now use rule-protected Firestore reads and calculations built into the website. Statistics does not require Cloud Functions, Gemini or a Blaze upgrade. Existing Spark database and Hosting quotas still apply.

## Using the page

Each tab retains its own campus, period, assessment filters and report while switching views. Changing accounts discards panel state and the shared data cache. Participation and Scores default to this month; Trends defaults to the last three calendar months through today. Presets load immediately. Custom dates require **Apply dates to this tab**. Dates use Asia/Manila, with inclusive end dates and partial buckets clearly marked.

**Refresh this tab** fetches a fresh source snapshot and rebuilds that report. Ordinary filter changes and opening another tab reuse a shared snapshot for up to five minutes. The caption shows **Data fetched** time, rather than implying cached data was just retrieved. Other already-open tab reports retain their own displayed snapshot until refreshed or their filters change.

Assessment filters affect assessment metrics only. Trends has activity/interval selectors. Scores separates instruments and versions, with a compact campus comparison and one selected histogram. Completion details and data limitations are expandable.

## Data access and privacy

The website uses the regular Firebase client SDK. Every read passes through the deployed Firestore security rules. The loader checks the signed-in user's server profile before reading collections and again before returning a report; only active `super_admin` accounts may use it. Changing accounts, losing access or a failed refresh discards its source cache. Superseded panel requests are ignored.

The client SDK receives full permitted documents, including confidential assessment answers and message documents. The Statistics loader immediately retains only calculation fields in its own in-memory snapshot; names, emails, message bodies and freeform notes are removed. It does not write raw inputs or reports to localStorage, IndexedDB, logs or the database. The SDK's normal in-memory document cache can still contain fetched documents. This architecture allows authorized admins to inspect underlying data through browser tools; display suppression is not an aggregate-only access boundary.

Counts and score summaries displayed by the page contain no student identifiers or raw answers. Groups below five students have no displayed sample size/statistics. Any small nonzero histogram bin causes the entire histogram to be withheld. These controls reduce display disclosure, without guaranteeing anonymity or preventing an authorized admin from inspecting source records.

The initial implementation scans at most 1,001 documents per source to detect a 1,000-record capacity limit. If any collection exceeds that limit, reporting stops with an explicit error; it never displays truncated totals. Reusing in-memory input avoids refetching all sources for each filter/tab. Profile rechecks still require small reads. Larger datasets need indexed activity summaries or narrower source queries before expanding this limit.

## Main-project deployment

Firebase Hosting serves the website at <https://spartan-g-a2d80.web.app>. Production builds verify the main project ID, disable emulator connections and exclude the development seeder route.

The former `getAdminStatistics` callable has been removed from the source exports. Its deployment was previously blocked on Spark; the website no longer calls it. Other features that use their own Cloud Functions are outside this Statistics change and retain their existing deployment requirements.

The local canonical Firestore rules add active-super-admin conversation reads. For the main project, the rules snapshot was downloaded using the supported Firebase initialization flow into an ignored isolated folder. `scripts/prepare-statistics-rules.mjs` applies only that same conversation-read change to the live snapshot. The release preserves existing appointment, signup, facilitator and other write/read behavior. It does not silently publish the broader security rules in the working tree; their coordinated rollout remains a separate task.

Prepare the narrow release after downloading the live snapshot to `.firebase/statistics-rules/firestore.rules`, then test and deploy it:

```powershell
node scripts/prepare-statistics-rules.mjs
firebase emulators:exec --only firestore --project demo-spartan-booking --config .firebase/statistics-rules/statistics-release.json "node --test firebase/functions/test/statisticsClientAccess.test.mjs"
firebase deploy --only firestore:rules --project spartan-g-a2d80 --config .firebase/statistics-rules/statistics-release.json
firebase deploy --only hosting --project spartan-g-a2d80
```

Do not reuse an old downloaded snapshot over newer production changes. The original snapshot is retained locally as a rollback reference. No live student documents, Storage rules, other functions or billing settings need modification for this release.

## Local demo

Requires Node, the existing npm dependencies, Firebase CLI and Java 21+ on PATH. Ports 8080, 9099, 9199 and 5180 must be available.

From `spartan-g`:

```powershell
npm.cmd run dev:statistics
```

This runs only Auth, Firestore and Storage emulators, seeds synthetic activity for **demo-spartan-statistics**, and serves <http://127.0.0.1:5180/admin/statistics>. No Functions emulator is needed. The seeder requires localhost Auth/Firestore emulators and the exact demo project ID. Configuration overrides apply only to that process; your `.env` and live database are untouched. Stop with Ctrl+C.

Local demo credentials: `admin@statistics-demo.example` / `StatisticsDemo123!`.

Try Lipa for an available histogram, Alangilan for withheld small bins, and Pablo Borbon for a suppressed group. Switch tabs and verify independent periods, choose custom dates, change instrument/campus focus, then refresh. Test an empty period, keyboard tab navigation with arrows/Home/End, and narrow-screen rendering.

## Calculation rules

The shared browser-safe implementation is `packages/shared-types/src/utils/statistics.ts`.

- Participation is a distinct-student union across requests, eligible sends and submissions. Retakes remain events but do not inflate unique counts.
- Registered-student rates include accounts registered by the observed period end, even if currently inactive. Missing registration/campus history can make rates estimated or unavailable.
- Completion follows each definition's start cohort; earlier starts cannot inflate its rate.
- Messages require a student sender, a two-person student/facilitator conversation and a currently accepted canonical link dated before the message. Failed, sending, deleted and system messages are excluded.
- Scores validate complete instrument answers against numeric 0-3 definition options, reject duplicates/unknown IDs/invalid values, and recompute totals. Stored client risk fields are ignored. DASS-21 subscales are doubled.
- Latest valid attempts are selected per student/instrument/version before campus filtering, with deterministic document-ID tie breaking. Invalid later attempts may fall back to an earlier valid result, with coverage reporting.
- Only verified definitions should declare `analyticsScoringVersion: "standard-v1"`. Unversioned definitions stay separate and use their current question sets; historical comparability is unverified.
- Legacy template submissions remain separate because cross-model deduplication is unavailable.

## Verification

```powershell
npm.cmd --prefix firebase/functions run test:statistics
npm.cmd --prefix firebase/functions run test:statistics-client
firebase emulators:exec --only firestore --project demo-spartan-booking --config .firebase/statistics-rules/statistics-release.json "node --test firebase/functions/test/statisticsClientAccess.test.mjs"
npm.cmd run typecheck --workspace=@spartan-g/web
npm.cmd run typecheck --workspace=@spartan-g/shared-types
npm.cmd run build:web:production
```

The calculation tests transpile the actual shared source; client tests use the actual browser loader. Access tests use the actual browser Firestore SDK against the minimal release rules in a localhost emulator, with synthetic records only. They verify admin score/messaging calculations, denied global conversation lists for students/facilitators/inactive admins/anonymous users, retained participant access and no new write privileges.

29 tests passed: 19 calculation, 7 cache/access-handling and 3 browser SDK/rules tests. Website and shared-types typechecks passed. Browser automation is unavailable in this session, so visual layout and keyboard interaction remain manual checks.
