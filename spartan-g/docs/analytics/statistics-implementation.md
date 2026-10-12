# Statistics implementation and testing

The website's `/admin/statistics` route now contains campus participation, engagement trends and an assessment score overview. The Statistics link is in the admin's left sidebar. The mobile branch is unchanged.

## Using the page

Use the **Participation**, **Trends** and **Assessment Scores** tabs to explore one analytical view at a time. Each tab keeps its own campus, period, assessment filters and report while you switch between views. Only visited tabs load reports; switching back restores the existing report without another request. Changing accounts discards all reports and filter state.

Participation and Assessment Scores default to this month. Trends defaults to the last three calendar months through today with monthly buckets. Select a period preset to load it immediately for that tab. Exact date inputs appear only for **Custom dates**; select **Apply dates to this tab** after editing them. Campus and assessment selectors update the current tab immediately. **Refresh this tab** reloads its applied filters. All reporting dates use Asia/Manila. Current periods stop at generation time and incomplete buckets are marked Partial.

The assessment filter changes assessment metrics only. Trends has its own activity and interval selectors. Instrument and scoring-version controls in Assessment Scores separate PHQ-9, GAD-7 and the three doubled DASS-21 subscales. A compact campus comparison lets you select one distribution at a time, rather than displaying a long stack of campus charts. Small-group suppression still applies to both the comparison and the selected distribution. Assessment completion and data limitations are expandable details.

## Local demo without hosting or billing

Requirements: Node, the existing npm dependencies, Firebase CLI and Java 21 or newer on PATH. Ports 8080, 9099, 9199, 5001 and 5180 must be available.

From `spartan-g`:

```powershell
npm.cmd run dev:statistics
```

This starts isolated Firebase emulators for **demo-spartan-statistics**, seeds synthetic campus activity, and serves a separate website at <http://127.0.0.1:5180/admin/statistics>. It overrides Firebase configuration only for that process; it does not edit your `.env` or contact the live database. The seeder refuses to run without localhost Auth/Firestore emulators and the exact demo project ID.

Local demo login:

- Email: `admin@statistics-demo.example`
- Password: `StatisticsDemo123!`

These are emulator-only credentials. Stop the demo with Ctrl+C. The regular `start-system.bat` continues using your existing project and settings.

Try All campuses, then Lipa, Alangilan and Pablo Borbon. Lipa demonstrates an available histogram; Alangilan demonstrates small-bin withholding; Pablo Borbon demonstrates a suppressed score group. In Participation, change the campus and activity period. Open Trends and verify its independent three-month period; change its activity and interval. Return to Participation and verify its previous filters are retained. In Assessment Scores, switch instrument and select campuses in the comparison list. Changing its submission period must not change either other tab. Change a tab to a month without activity to test its empty state. Use arrow keys and Home/End in the tab bar, and open at a narrow viewport to test stacked controls and horizontal table scrolling.

## Hosted backend

The page calls `getAdminStatistics` in `us-central1`. Both the route and backend check admin access; the backend requires a currently active `super_admin` and rechecks before delivery. It returns aggregate values rather than student identities, answers or message content. Browser queries to download all raw records are not used.

The main Firebase project `spartan-g-a2d80` still requires Blaze for Cloud Functions. A deployment readiness check again failed at the required Artifact Registry API because billing has not been enabled. Until the endpoint is deployed, the main-project website displays an unavailable-service message rather than fabricated zero statistics. The local demo works independently. No billing upgrade has been performed.

Firebase Hosting now targets the existing `spartan-g-a2d80` site and serves `apps/web/dist` with SPA route rewrites. Its predeploy step validates the main-project configuration and builds with emulator connections disabled. Development assessment seeding is restricted to local development admin sessions and omitted from the production route table. Hosting the website alone does not enable the report endpoint.

The website was published to <https://spartan-g-a2d80.web.app>. Both `/` and `/admin/statistics` returned HTTP 200; the Statistics route served the built SPA and the deployed JavaScript matched the local production asset by SHA-256. The Statistics backend was **not deployed**: its readiness check remains blocked by the Blaze requirement. Live statistics therefore remain unavailable until backend deployment is completed. Main-project Firestore/Storage rules, other functions, database records and billing settings were not released or changed as part of this website/statistics deployment.

To build and publish the website using the configured Firebase account:

```powershell
npm.cmd run build:web:production
firebase deploy --only hosting --project spartan-g-a2d80
```

When hosting is ready, build and deploy the endpoint using the normal authorized deployment workflow:

```powershell
npm.cmd --prefix firebase/functions run build
firebase deploy --only functions:getAdminStatistics --project spartan-g-a2d80
```

## Calculation and disclosure rules

- Participating students are the union of appointment requesters, eligible message senders and assessment submitters. Retakes and repeated requests do not inflate distinct-student totals.
- Registered-student rates use accounts registered by the observed period end, including currently inactive accounts. Rates are unavailable if dates/cohort attribution are incomplete and are labeled estimated where historical campus membership is unavailable.
- Assessment completion follows students who started a matching definition within the period, not all submissions within the period. Per-definition cohort rows accompany the overall at-least-one-completion measure.
- Messages require a real student sender, a two-person student/facilitator conversation and a canonical currently accepted link dated before the message. Failed, sending, system and deleted messages are excluded. Revoked historical access cannot be reconstructed.
- Scores require expected question IDs and numeric 0–3 definition options. Missing, duplicate, unknown, blank, noninteger or out-of-range answers cannot become default-zero scores. Different complete instruments can contribute independently. Stored risk fields are ignored.
- The latest valid attempt per student/instrument/version wins, with document-ID tie breaking. An invalid later attempt can fall back to a valid earlier one, with coverage reporting.
- Definitions explicitly declaring `analyticsScoringVersion: "standard-v1"` share the supported scoring version. Do not set this on arbitrary questionnaires; verify question content and scoring compatibility first. Existing unversioned definitions remain separated by definition and are labeled as using the current question set. Immutable historical definition snapshots remain future work.
- Groups with fewer than five students return no exact sample size or score summaries. If any nonzero histogram bin has fewer than five students, all bins are withheld to reduce subtraction disclosure. This does not guarantee anonymity across filters or other participation metrics.
- Legacy template instances remain a separate coverage count, rather than being added to course-attempt totals without reliable cross-model deduplication.
- Report reads are limited to 10,000 records per source collection. Reports exceeding capacity fail explicitly. This initial version scans bounded source metadata; larger deployments should replace scans with indexed, versioned event aggregates.

No diagnostic labels, treatment recommendations, individual drill-down, score ranking or AI service are part of this page.

## Automated checks

From `spartan-g`, run:

```powershell
npm.cmd --prefix firebase/functions run build
npm.cmd --prefix firebase/functions run test:statistics
firebase emulators:exec --only firestore --project demo-spartan-booking --config firebase.booking-test.json "node --test firebase/functions/test/statisticsAccess.test.mjs"
npm.cmd run typecheck --workspace=@spartan-g/web
npm.cmd run build:web
```

Calculation tests use synthetic fixtures. Access tests refuse to run without a localhost Firestore emulator, test the actual endpoint implementation and callable authorization, and verify that report responses omit private fields. No live student data is used.

## Verification recorded

- 19 calculation tests and 4 backend/access tests passed.
- Functions compilation and the production website build passed. Vite still reports the existing large-bundle warning.
- After the tabbed-layout revision, the website typecheck and production build passed again. Server-rendered view checks using the demo report verified separate participation/trend content, a single selected score histogram, small-group/bin withholding and expandable coverage details. These checks do not simulate browser interaction.
- The running demo was checked through Auth emulator login and actual HTTP callable requests: 21 participating/submitting students overall, with campus totals of 10, 8 and 3. Lipa's histogram was available, Alangilan's small bins were withheld, and Pablo Borbon's score group was suppressed. Responses contained no student IDs; an anonymous request returned HTTP 401.
- Browser automation was unavailable in this session. Visual layout, keyboard navigation and narrow-screen rendering still need the manual checks described above; they are not claimed as verified.
