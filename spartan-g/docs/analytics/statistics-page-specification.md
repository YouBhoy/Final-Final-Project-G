# Admin Statistics page specification

Date: October 13, 2026 (Asia/Manila)

October 27 extension: Referral Analytics is now the first/default tab, reporting student-to-facilitator request creation cohorts, current statuses and weekly/monthly counts. Participation, Trends and Assessment Scores remain supporting tabs. The sections below describe the original three views. See [implementation and testing](statistics-implementation.md#referral-analytics) for referral definitions, test-data disclosure, campus attribution and forecasting limitations.

Route: `/admin/statistics`

Navigation: Statistics in the admin's left sidebar, below Dashboard

Status: website implementation uses protected Firestore reads and browser calculations on the Spark plan. See [implementation and testing](statistics-implementation.md) for the local demo, validation rules and narrow Firestore permission release. Legacy template counts remain separate, and historical scoring/campus snapshots remain data limitations.

## Purpose and agreed scope

SPARTAN-G is an extension of the college's student portal. Its primary purpose is to make it easier for students to connect with guidance facilitators. Statistics should help administrators understand participation, use of the connection features, campus coverage and submitted assessment responses.

The page will contain three analytical views:

1. Campus participation and engagement.
2. Engagement trends over time.
3. Assessment score overview by campus.

These are descriptive and exploratory statistical views, not three separate descriptive/diagnostic/predictive analytics categories. They do not diagnose students, prescribe treatment, rank campuses by wellbeing or measure whether embarrassment has decreased. Measuring the latter would require voluntary experience feedback that is not currently collected.

Individual assessment scores will contribute to aggregates, but names, emails, answers and individual score lists will not appear on this page. Authorized student-record workflows remain separate.

## Page structure

### Tabs and independent controls

Display **Participation**, **Trends** and **Assessment Scores** as separate tabs. Each tab owns its filters, reporting period, refresh state and report; changes in one tab do not affect the others. Retain each visited tab's state when switching, and discard it when the account changes. Show only the active view rather than stacking all three sections on one page.

- **Campus:** All campuses by default, plus the college's configured campuses. Use the campus directory and canonical labels rather than hardcoded display names. Preserve historical/inactive campuses when they have reportable data.
- **Date range:** Participation and Assessment Scores default to this month; Trends defaults to the last three calendar months through today. Each tab offers this week, this month, previous month, the three-month window and custom inclusive start/end dates. Presets load immediately for the current tab; exact date inputs appear only for Custom dates.
- **Assessment:** All supported assessments by default; allow a definition/version selection for assessment metrics. This filter does not change appointment or messaging totals, and that scope is stated next to the control.
- **Trend interval:** weekly or monthly in Trends, using that tab's period.
- **Refresh:** reload only the current tab's report and display its generation time.

Dates use Asia/Manila. Convert an inclusive end date to the next local midnight as an exclusive boundary. Weeks run Monday through Sunday. Reject reversed/invalid dates and visibly mark partial weeks/months. Never silently use the browser's timezone to determine report boundaries.

Suggested desktop composition:

```text
Statistics
Participation | Trends | Assessment Scores

Active view description              Refresh this tab
Campus / Period preset / Relevant view controls
Custom date inputs (only when selected)

Participation: totals + campus comparison + completion details
Trends: period totals + selected activity chart
Scores: campus comparison + one selected campus distribution

Expandable data coverage and limitations
```

Use the existing admin layout, theme tokens and responsive navigation. Filters stack on narrow screens. Charts have readable legends, units, sample sizes and accessible summaries; information must not depend on color or hover alone.

## View 1: Campus participation and engagement

### Headline metrics

- **Participating students:** distinct student IDs with at least one qualifying activity in the period. Qualifying activities are a student-originated appointment request, a valid student-sent message in an authorized student–facilitator conversation, or an assessment submission. Combine these with a union, not a sum, because one student can use multiple features.
- **Students requesting appointments:** distinct students who created an appointment request during the period. Count the original request once even if its status later changes or it is rescheduled.
- **Students engaging in messaging:** distinct students who sent at least one eligible message during the period. An automatically created conversation is not evidence that the student used messaging.
- **Students submitting assessments:** distinct students who submitted an assessment in the period. A student may count toward completion even when their answers are not valid for score aggregation; expose that distinction in data coverage.
- **Participation rate among registered portal students:** participating students divided by eligible registered portal students for the selected campus/period. Display the numerator and denominator.

Do not call this the college-wide participation rate. College enrollment totals are not available. If the team later imports official campus enrollment denominators, introduce a separately labeled enrollment-based rate.

### Campus comparison

For each campus, show participating students, students requesting appointments, students engaging in messaging, students submitting assessments, registered-student denominator and the participation rate. Use grouped bars for activity counts and a compact comparison list for denominators/rates. Sort campuses by name rather than a best/worst ranking.

Example using hypothetical figures: Alangilan has 80 participants among 400 registered portal students, or 20%; Lipa has 45 among 150, or 30%. Show both counts and percentages: a larger campus should not appear more successful simply because it has more students.

For All campuses, deduplicate students across campuses and features. Campus-level counts may not add up to the global unique total when students transfer or participate in multiple campus contexts; explain this instead of forcing totals to match.

### Supporting assessment engagement measures

- Students who started an assessment during the period.
- Assessment submissions made during the period.
- **Start-cohort completion rate:** distinct students who started a particular assessment/version in the period and submitted it by the period end, divided by distinct students who started that assessment/version in the period.
- Started-but-not-submitted count for that same cohort.

Do not divide all submissions in the period by all starts in the period: some submissions may belong to earlier starts. Distinguish unique students from total attempts, and do not label every in-progress attempt as abandoned. No reliable abandonment reason is recorded.

## View 2: Engagement trends over time

Show weekly/monthly trends for:

- Unique participating students per bucket.
- Appointment requests created per bucket.
- Unique students sending eligible messages per bucket.
- Assessment submissions per bucket, with a separate unique-student count.

Offer an activity selector so a chart does not mix incompatible units on one axis. Counts of events and counts of unique students must be labeled separately. Display the campus and reporting period in chart captions.

Optional comparison cards can show changes against an equal-length preceding period. Show both underlying counts and the date ranges. When the baseline is zero, show the absolute change and “percentage change unavailable” instead of an infinite percentage.

Example using hypothetical figures: Lipa has 20 appointment requests in September and 30 in October, an increase of 10 requests or 50%. This describes use; it does not prove reduced embarrassment, improved wellbeing or an effect of the portal. Do not compare a partial October with a complete September without marking the unequal exposure.

A student may appear in several time buckets. Summing weekly unique counts does not give the period's unique-student total.

## View 3: Assessment score overview by campus

### Instruments and measures

Keep each scale/domain separate:

- PHQ-9 total.
- GAD-7 total.
- DASS-21 depression subscale.
- DASS-21 anxiety subscale.
- DASS-21 stress subscale.

For each selected instrument/version and campus, show:

- Number of unique students represented.
- Median score.
- First and third quartiles, where the sample supports showing them.
- A histogram of numeric score ranges, using the same bins for every campus within that instrument.
- Optional mean as a secondary statistic, accompanied by sample size.

Use numeric score ranges rather than diagnostic/treatment labels or a campus “risk ranking.” Do not combine the different instruments into a single average wellbeing score. The current implementation doubles DASS-21 subscale sums; retain and label that scoring convention consistently. The PHQ-9 and GAD-7 totals and doubled DASS subscales have different ranges, so they need separate axes and selectors.

Hypothetical example: “Lipa · PHQ-9 · October · 40 participating students · median score 6.” A histogram shows the spread behind that median. A second campus with a median of 8 is described as having a different observed score distribution; it is not described as having worse student mental health.

DASS scores are dimensional measures, and clinical interpretation requires appropriate expertise. The dashboard's purpose is to describe submitted responses. See [UNSW's DASS guidance](https://dass.psy.unsw.edu.au/over.htm).

### Attempt selection and validation

1. Restrict eligible attempts to submitted/graded records whose submission time falls within the selected period. Drafts do not contribute scores.
2. Identify the instrument and compatible question-set/scoring version from a trusted definition or immutable snapshot, not solely from a client-provided score field.
3. Validate the complete expected answer set separately for each instrument. Reject duplicate question IDs, missing required items, unknown option values, nonnumeric values and values outside the supported scale. Missing answers must not silently become zero.
4. Recompute scores from validated answers. Do not trust editable stored `overallRiskScore`, severity labels or client-computed totals as authoritative statistics.
5. Select the latest valid submitted attempt per student, instrument and compatible scoring version within the period. Across definitions using the same compatible instrument/version, avoid counting the same student twice in a combined chart.
6. If an instrument is incomplete but another instrument is complete, include only the complete instrument. Show separate coverage counts.
7. Track excluded/incomplete attempts and the number of submitting students without a usable score. If an earlier valid attempt is used because a later attempt is invalid, include that fact in coverage reporting.
8. Break timestamp ties deterministically by document ID. Never choose an arbitrary record based on query arrival order.

The selected attempt supplies the campus snapshot for its score. Explain that this represents the campus recorded with that assessment, not necessarily the student's current campus.

### Time trends for scores

A later enhancement may show a campus's median score by month using the same validation, versioning and small-group rules. Different students may contribute each month. Such a chart does not establish that individual students improved or that guidance appointments caused a change. Individual paired change analysis is outside this initial page.

## Data sources and current gaps

### Sources

- `users`: student role, registration date and current campus; denominator/source attribution fallback.
- `campuses`: canonical campus keys and display labels.
- `appointments`: student/facilitator identity, original request date and status.
- `messages` and `conversations`: sender identity, sent timestamp and verified participant relationship. Read only the metadata required to count eligible activity, not message bodies.
- `assessment_attempts`: start/submission dates, student identity, campus snapshot, status and answers needed for validated scoring.
- Trusted assessment definitions/version snapshots: expected question sets and scoring conventions.

Phase 3A instances/responses and Phase 3B attempts are different models. Never add their counts blindly: the same logical submission must not be counted twice. Unsupported template questionnaires may contribute completion counts but cannot be mapped into PHQ-9/GAD-7/DASS scores without a declared compatible instrument/version.

### Campus attribution

Assessment attempts already capture campus, but appointment/message events do not consistently retain historical campus snapshots. Prefer an event-time campus snapshot when available. Otherwise use current user campus and label that measure “current campus attribution”; do not present it as accurate historical campus membership. Missing campus data belongs in an explicit Unknown/Unassigned group and coverage count, rather than being discarded.

For accurate future reports, snapshot campus at appointment-request/message-event creation and retain an auditable campus assignment history. Decide whether transferred students belong to an activity's originating campus or their current campus before making historical rates official.

### Denominators and historical rates

Use the registered-student cohort eligible by the period end, not students who registered afterward. Do not remove an earlier participant merely because their account is currently inactive. Historical active/enrolled status and historical campus denominators cannot be recovered accurately from a current profile alone.

Where registration dates or campus history are incomplete, mark the denominator as estimated or unavailable. Do not show a precise historical participation rate with an unsupported denominator or allow numerator/denominator attribution differences to produce a misleading percentage over 100%. Counts can still be displayed with clear coverage notes.

### Timestamp normalization

Legacy records may use `createdAt`/`updatedAt` or `created_at`/`updated_at`. Normalize explicitly, prefer the canonical timestamp when both exist and count conflicting/missing timestamps. A record without a usable event date does not enter a date-filtered metric; show how many were excluded.

### Required foundation for reliable score reporting

The existing scoring functions accept incomplete or out-of-range numeric answers and client submission can write risk metadata. Add strict validation and use one versioned scoring implementation for reporting. Historical assessment definitions are not currently immutable snapshots; separate unknown-version results from versioned comparisons rather than assuming comparability.

## Privacy and authorization

- The Statistics route and loader require an active super administrator. Every source read uses the client SDK and must be allowed by deployed Firestore rules; a hidden sidebar link is not authorization.
- Calculate reports in the website from authorized Firestore records. The browser receives complete permitted documents; the loader retains only calculation fields in its own memory snapshot and displays aggregates. Authorized admins can inspect underlying data, so this version does not provide aggregate-only browser access.
- Do not include names, emails, raw text answers, message content, student IDs or AI narratives in report responses, logs or exports.
- Suppress campus/instrument score summaries when fewer than 5 distinct students contribute. This is a proposed configurable project setting, not a claimed legal or clinical standard.
- Suppress small nonzero score bins as well; do not reveal their exact values through tooltips, downloads, totals or simple subtraction from other bins. Small-group suppression is a disclosure-reduction measure, not a guarantee of anonymity.
- Keep participation counts separate from confidential score distributions. Do not allow charts to drill down to identified students.
- Keep source snapshots in account-bound memory for at most five minutes, clear them on auth changes/errors, and recheck the current server profile for every load. Refresh fetches fresh sources. Never persist raw snapshots in browser storage or log them.
- College-wide conclusions are unsupported: assessment participation is voluntary/selected and may not represent all students in a campus.

## Loading, empty, error and coverage states

- Show loading indicators while a report is requested; do not briefly show zero values as if they were real results.
- For no matching records, show “No activity recorded for this campus and period.”
- Show unavailable rates as unavailable, not 0%; a zero denominator must never result in a division error.
- Explain suppressed score views with “Not enough participants to display this group.” Do not reveal the exact small group size beside that message.
- Display missing campus/date/version data and score exclusions in a coverage section.
- Preserve the last successful report only if clearly marked stale after a failed refresh. Do not silently keep old data under new filter labels.
- Debounce/cancel superseded requests and ignore late results after a filter/account change.
- Distinguish network failure, permission denied, read quota/capacity limits and no data. This page has no Cloud Functions dependency; bounded reads must fail explicitly instead of presenting partial totals.

## Implementation sequence

1. Finalize metric definitions, reporting periods, campus attribution and scoring-version conventions using this specification.
2. Implement pure aggregation/validation functions with synthetic fixtures. No live student data is needed for development tests.
3. Load authorized records through Firestore rules and calculate in the website. Reuse the pure tested implementation and a short account-bound memory cache to reduce repeated reads. Retain timestamp/campus coverage notes; add event snapshots in a later data-quality update.
4. Replace the `/admin/statistics` placeholder with shared filters and the campus participation view.
5. Add engagement trend charts with bucket-aware counting and meaningful period comparisons.
6. Add validated assessment score distributions, summary statistics, coverage and disclosure controls.
7. Verify the admin-only route/loader, source permissions, responsive layout, keyboard access and real test-environment data before release.

Use authenticated, rule-protected source queries and active-admin checks in the loader. No Gemini key, AI service, Cloud Functions deployment or billing upgrade is needed for these calculations. Forecasting, treatment suggestions, automated clinical interpretation, student rankings and external portal authentication integration are outside this implementation scope.

## Acceptance criteria

- Statistics is reachable from the admin's left sidebar; student/facilitator/inactive/anonymous sessions are rejected by its loader. Firestore reads obey deployed permissions, and the added global conversation-read permission is limited to active super admins.
- Each view applies its own campus/date controls consistently and preserves them while switching tabs; assessment-only filters are visibly scoped. Changing a view's reporting period does not change either other view.
- Unique students are counted once in period totals despite multiple appointments/messages/retakes. Weekly unique counts are not incorrectly summed into a period total.
- Activity timestamps and bucket boundaries respect Asia/Manila, including local midnight, period-end and week-boundary cases.
- Campus counts include Unknown/Unassigned records; current-campus fallbacks and estimated denominators are clearly labeled.
- Completion rates use a consistent start cohort; missing denominators and zero baselines are handled explicitly.
- Score distributions use latest valid submissions, correct instrument ranges and version conventions. Malformed/partial answers cannot become low scores through default-zero behavior.
- Campus/instrument score summaries and bins honor the proposed minimum group size without exposing exact suppressed values.
- Reports contain no personal identifiers, answer text or message content, and missing data is visible in coverage reporting.
- Empty/error/stale results are distinguishable, and filter changes do not display an old response under a new label.
- Synthetic metric/authorization tests, website typecheck and production build pass. Browser SDK/rules testing is documented separately from visual browser checks.

Related reference: [Assessment analytics opportunities](assessment-analytics-opportunities.md). That earlier document inventories available data; this specification defines the Statistics page's agreed nonclinical purpose and initial implementation.
