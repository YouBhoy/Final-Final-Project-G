# Statistics implementation and testing

The website's `/admin/statistics` route opens on **Referral Analytics**, with Participation, Trends and Assessment Scores available as supporting tabs. Reports use rule-protected Firestore reads and calculations built into the website. Statistics does not require Cloud Functions, Gemini or a Blaze upgrade. Existing Spark database and Hosting quotas still apply.

## Referral Analytics

A referral in this view is a student request to a facilitator, stored in `appointments`. Each document counts once by its creation date. Rescheduling reuses a document and does not count as another referral. Accepted facilitator-student links are not the request source because they cannot represent pending or declined requests.

The default referral view covers the last twelve calendar months through today, grouped weekly, to include the available training history. Admins can change campus, dates and weekly/monthly interval. The report shows request total, distinct recorded student IDs, currently pending and currently accepted counts, all current status categories and request-volume trends. Completed, cancelled, no-show, reschedule and declined statuses remain separate. Unknown statuses are visible as an unrecognized category rather than discarded. Status totals and trend totals reconcile to the request total. No acceptance rate, clinical scoring, response-time prediction or facilitator recommendation is added.

Creation cohorts use Asia/Manila boundaries and stop at report-generation time. Statuses describe the fetched snapshot; selecting a past creation period does not reconstruct past decisions. Date fallback/conflicts, future-dated exclusions, absent account IDs and unavailable student accounts are disclosed. Stored requests remain counted when their associated account is absent; the distinct student count omits missing IDs.

Referral campus filters use only the request-time campus snapshot. Missing campuses remain Unknown / Unassigned instead of using a student's current campus. This intentionally differs from the older Participation/Trends fallback behavior. Missing-date counts cover the campus-scoped source because those records cannot be assigned a reporting period. Other referral coverage counts describe included records, except the explicitly labeled future-date exclusions.

New client bookings now read the student's account inside the booking transaction and copy its nonempty campus into the appointment. The campus field remains optional for older mobile/web clients; when supplied, Firestore creation rules require it to match the student's nonempty account campus. Later client updates cannot change it, including rescheduling after a campus transfer. Legacy accounts without a usable campus can still book without a snapshot. Requests without a snapshot remain Unknown / Unassigned; no historical campus is inferred or backfilled. Deploy the compatible rules before releasing clients that send campus, since earlier rules reject that field. Mobile should adopt the same request-time snapshot to complete multi-campus reporting.

On October 28, 2026, the compatible Firestore rules were deployed to `spartan-g-a2d80`, followed by the production website. Validation included 50 analytics tests, 29 booking/access emulator tests and the production build. The hosted JavaScript matched the local production build and returned HTTP 200. A signed-in walkthrough of the live analytics tabs remains outstanding; these checks do not establish real-world forecasting validity or full mobile-app validation.

The user confirmed on October 27, 2026 that the existing 36 requests were development/testing data. A dated notice explains that these figures do not establish real demand. The UI does not automatically identify later pilot records; provenance separation must be implemented before real-world forecasting evaluation. A learned forecasting prototype now displays experimental estimates and measured test-data errors, with production forecasting explicitly disabled.

The existing browser loader additionally retains the request `status` field; no new collections, permissions, writes or Cloud Functions are needed. Existing source-size limits, active-super-admin access checks, pseudonymization and memory-cache behavior remain in effect.

Validate this change with `npm.cmd run test:referral-statistics --workspace=@spartan-g/web`, the website/shared-types typechecks and the production website build. Automated tests validate calculations and training/evaluation mechanics; real-world forecast validity remains unverified. The previous deployment notes below describe the earlier release, not deployment of these local changes.

## Learned forecasting prototype

`packages/shared-types/src/utils/referralForecast.ts` fits standardized ridge regression with two features: the previous week's count and the count two weeks ago. Coefficients and an unpenalized intercept are learned from the input outcomes. Regularization alpha=1 and the two lags are fixed in advance, not selected using the evaluation results. The closed-form two-feature solve minimizes squared residuals plus alpha times the squared standardized coefficients. The saved coefficients/intercept are converted back to original count units. Prediction clips negative estimates to zero; it does not round before evaluation.

The implementation follows the [ridge regression objective](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.Ridge.html) and fits feature scaling separately within each training window to avoid [preprocessing leakage](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage). It runs entirely in the existing browser/TypeScript stack, without a Python service, new packages, database writes or Cloud Functions.

Only complete Monday-to-Sunday weeks in Asia/Manila are used. The first observed request week is excluded because logging may have started midweek, as are partially selected filter weeks and the unfinished current week. Empty gaps are treated as zero only as an explicit experimental assumption; this does not prove logging coverage. Missing/conflicting creation dates block fitting. Campus filtering still uses request-time snapshots. The model always uses weekly counts regardless of chart interval; changing campus or date range changes the experiment.

The minimum 11 input weeks provides two lag weeks, at least six initial fitting rows, and at least three test weeks. This is an engineering minimum for a demonstration, not a statistical claim of adequate sample size. The last 25% of input weeks (rounded up, minimum three) are evaluated one week at a time. Each fit and scaler sees only observations before that test week. Previously evaluated outcomes become available for subsequent fits, as in an expanding-window deployment. No evaluation result is used to change model settings. MAE and RMSE are computed from these one-step predictions, alongside the same-as-last-week baseline on the identical weeks. Baseline wins and ties remain visible. There is no accuracy percentage or invented confidence interval.

A final model is refitted on all eligible weeks, then estimates the full week immediately following that history. This may be the current or a historical week depending on filters; the UI labels exact target dates and does not call it an upcoming week unconditionally. Prototype metrics describe the walk-forward models, not in-sample performance of the final refit.

For reproducible offline fitting, supply an aggregate audit JSON (no identities or notes):

```powershell
npm.cmd run train:referral-prototype -- --input=../tmp/referral-history-prototype.json --output=docs/analytics/referral-forecast-prototype.json --data-kind=development
```

The CLI uses the exact same training module as the dashboard and exports the input weekly series, learned coefficients/scaling metadata, chronological predictions, errors, target week and explicit development-only provenance. It never connects to Firebase. Use `scripts/audit-referral-history.mjs --as-of=YYYY-MM-DD` separately to obtain aggregate source data. The as-of date controls complete-week selection. Insufficient/invalid inputs produce no fitted model or metrics and a nonzero CLI exit status.

The included October 27, 2026 full-history experiment uses 16 complete weeks (July 6 through October 19), evaluates four later weeks, and has model MAE 1.0769/RMSE 1.2713 versus baseline MAE 0.75/RMSE 1.1180. The baseline wins on this development dataset. This result is not grounds for selecting a model for real demand; real pilot history, logging/provenance verification and a new chronological evaluation are still needed. The dashboard's default shorter window may produce different results.

## Using the page

### Extended model comparison for the October 29 presentation

The Ridge reference remains visible; `comparisonStudy` adds three candidate families and three benchmarks. Standardized ridge uses two lags and alpha=1. Penalized Poisson regression uses the same two lags, a log link, an unpenalized intercept and slope penalty 1 on the mean negative log-likelihood scale; fitting uses damped Newton steps with a gradient convergence check. It is a count-mean alternative, not a claim that the data satisfy a Poisson variance assumption. Fits that fail or do not converge are labeled unavailable rather than assigned artificial scores. All-zero training outcomes use the exact zero-rate boundary solution.

Simple exponential smoothing initializes level at the first training observation and chooses alpha from {0.1, 0.3, 0.5, 0.7, 0.9} by minimum one-step squared error on fitting history. The alpha grid and initialization are fixed implementation choices; alpha itself is learned from data. Benchmarks are last week's count, the historical mean and always zero. The latter checks whether zero-heavy periods make overall error misleading. These benchmarks are comparisons, not substitutions for the learned model.

At least 14 complete weeks are required for the extension. The final 25% (minimum three weeks) remains the later development backtest. Earlier validation starts after eight observed weeks, leaving at least six initial regression fitting rows and at least two validation weeks at the minimum history length. All methods use the same periods. A learned candidate is chosen by earlier validation MAE, then RMSE; ties retain the fixed Ridge/Poisson/smoothing order. That candidate is fixed before any later backtest scores are computed. Benchmarks are not eligible for learned-candidate selection, so the selected candidate can still be worse than a benchmark. Subsequent one-step fits may use earlier observed backtest outcomes, as they would become available over time.

The comparison reports MAE, RMSE, signed bias and MAE only on weeks with nonzero actual demand. When no active weeks exist, that last metric is unavailable, not zero. It reports active/zero sample sizes and warns when validation contains no active weeks. The UI includes each method's later weekly predictions and a separate validation-selected estimate, preserving the clearly labeled original Ridge estimate. Nothing auto-promotes a model into production.

For the saved full-history development run: validation is August 31 through September 21, 2026 (four zero-count weeks); later backtesting is September 28 through October 19 (two zero-count and two active weeks). Poisson is selected among learned candidates on validation, but has later MAE 1.0732/RMSE 1.2768, versus Ridge 1.0769/1.2713 and the last-week benchmark 0.75/1.1180. The tiny difference between Poisson and Ridge is not evidence of superiority. The zero validation segment cannot establish performance on positive demand.

These same development periods were already inspected during prototyping. Separating selection in code prevents future-outcome leakage within a run, but does not make the reused dataset a fresh independent confirmation. All comparisons are exploratory. A genuinely new real-data evaluation, with logging coverage and provenance established, is required. No significance tests, confidence intervals or production accuracy claims are made from four weeks.

Method references: [Poisson log-link regression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.PoissonRegressor.html), [simple exponential smoothing](https://otexts.com/fpp3/ses.html), and [separating model selection from evaluation](https://scikit-learn.org/stable/modules/cross_validation.html).

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
