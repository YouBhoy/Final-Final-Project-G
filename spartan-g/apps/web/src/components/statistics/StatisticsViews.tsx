import { ALL_CAMPUSES, estimateCampusFacilitatorNeed, getCampusLabel, type StatisticsReport } from '@spartan-g/shared-types';
import { Card } from '../ui/Card';
import { AnalyticsBars, AnalyticsDonut, AnalyticsLineChart } from '../analytics/AnalyticsCharts';

export type StatisticsView = 'overview' | 'referrals' | 'forecast' | 'staffing' | 'participation' | 'trends' | 'scores';
export type TrendActivity = 'participants' | 'appointmentRequests' | 'messagingStudents' | 'attempts' | 'submissions' | 'assessmentStudents';
export const activityLabels: Record<TrendActivity, string> = {
  participants: 'Unique participating students', appointmentRequests: 'Appointment requests',
  messagingStudents: 'Unique students sending messages', attempts: 'Assessment attempts', submissions: 'Assessment submissions',
  assessmentStudents: 'Unique students submitting assessments',
};
export const control = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-100';
export const format = (value: number | null, suffix = '') => value === null ? 'Unavailable' : `${Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)}${suffix}`;
export const campusLabel = (key: string, label: string) => key === label ? getCampusLabel(key) : label;

type OperationalBand = 'Limited' | 'Moderate' | 'Adequate' | 'Low' | 'High';

function publicCount(value: number): string {
  return value >= 1 && value <= 4 ? 'Fewer than 5' : value.toLocaleString();
}

function participationBand(rate: number | null, denominator: number): OperationalBand | 'Insufficient data' {
  if (denominator < 20 || rate === null) return 'Insufficient data';
  if (rate <= 30) return 'Limited';
  if (rate <= 60) return 'Moderate';
  return 'Adequate';
}

function demandBand(value: number, denominator: number): OperationalBand | 'Insufficient data' {
  if (denominator < 20) return 'Insufficient data';
  const rate = denominator ? value / denominator : null;
  if (rate === null) return 'Insufficient data';
  if (rate <= 0.25) return 'Low';
  if (rate <= 0.75) return 'Moderate';
  return 'High';
}

function completionBand(rate: number | null, starters: number): OperationalBand | 'Insufficient data' {
  if (starters < 10 || rate === null) return 'Insufficient data';
  if (rate <= 40) return 'Limited';
  if (rate <= 70) return 'Moderate';
  return 'Adequate';
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="p-5">
    <p className="text-sm font-medium text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{value}</p>
    <p className="mt-2 text-xs leading-relaxed text-gray-500">{detail}</p>
  </Card>;
}
const chartColors = ['#b91c1c', '#0f766e', '#334155', '#d97706', '#7c3aed', '#2563eb', '#be123c', '#15803d'];
function Donut({ rows, label }: { rows: { label: string; value: number }[]; label: string }) {
  const visible = rows.filter(row => row.value > 0);
  const total = visible.reduce((sum, row) => sum + row.value, 0);
  if (!total) return <p className="text-sm text-gray-500">No chart data for this selection.</p>;
  let offset = 0;
  const stops = visible.map((row, index) => {
    const start = offset / total * 100;
    offset += row.value;
    return `${chartColors[index % chartColors.length]} ${start}% ${offset / total * 100}%`;
  }).join(', ');
  return <div className="flex flex-wrap items-center gap-6" role="img" aria-label={label}>
    <div className="h-40 w-40 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }}>
      <div className="m-8 flex h-24 w-24 items-center justify-center rounded-full bg-white text-center text-xs font-semibold text-gray-500 shadow-inner">{total.toLocaleString()}<br />total</div>
    </div>
    <ul className="min-w-[12rem] flex-1 space-y-2 text-xs">
      {visible.map((row, index) => <li key={row.label} className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-gray-600"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />{row.label}</span>
        <span className="font-semibold tabular-nums text-gray-800">{row.value.toLocaleString()} · {Math.round(row.value / total * 100)}%</span>
      </li>)}
    </ul>
  </div>;
}
/** Values remain visible for keyboard and screen-reader users. */
function Bars({ rows, color = 'bg-red-600', unit }: { rows: { label: string; value: number; note?: string }[]; color?: string; unit: string }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return <div className="space-y-4" role="list" aria-label={unit}>
    {rows.map((row, index) => <div role="listitem" key={`${row.label}-${index}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-gray-700">{row.label}{row.note && <span className="ml-2 text-xs text-gray-500">{row.note}</span>}</span>
        <span className="font-semibold tabular-nums text-gray-900">{row.value.toLocaleString()}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-gray-100" title={`${row.label}: ${row.value.toLocaleString()}`} role="img" aria-label={`${row.label}: ${row.value.toLocaleString()}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${row.value / max * 100}%` }} />
      </div>
    </div>)}
  </div>;
}

function ForecastComparison({ study }: { study: StatisticsReport['referrals']['forecast']['comparisonStudy'] }) {
  if (study.status !== 'ready') return <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">The extended comparison needs at least {study.requiredWeeks} complete weeks to separate fitting, validation and later backtesting. Select a longer date range.</p>;
  return <section aria-label="Forecast model comparison" className="mt-6 border-t border-gray-200 pt-5">
    <h4 className="font-semibold text-gray-900">Model comparison with separate validation</h4>
    <p className="mt-2 text-sm text-gray-600">Three learned candidates and three benchmarks use identical periods. Candidate selection uses validation MAE, with RMSE as a tie-breaker, before later backtest errors are calculated.</p>
    <p className="mt-3 text-xs text-gray-500">Validation: {study.validationStart} to {study.validationEnd} ({study.validationWeeks} weeks). Later development backtest: {study.testStart} to {study.testEnd} ({study.testWeeks} weeks: {study.testActiveWeeks} active, {study.testZeroWeeks} zero-count).</p>
    {study.validationActiveWeeks === 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">All validation weeks have zero stored requests. This selection cannot establish which model handles weeks with real demand best.</p>}
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs">
      <caption className="mb-3 text-left text-gray-500">Errors in requests per week. Lower MAE/RMSE is better. Positive bias means overprediction. Active-week MAE includes only weeks with actual requests.</caption>
      <thead><tr>{['Method', 'Validation MAE', 'Backtest MAE', 'Backtest RMSE', 'Bias', 'Active-week MAE'].map(label => <th key={label} className="border-b border-gray-200 p-2 font-semibold text-gray-500">{label}</th>)}</tr></thead>
      <tbody>{study.candidates.map(candidate => <tr key={candidate.id} className={candidate.id === study.selectedId ? 'bg-red-50' : ''}>
        <th scope="row" className="border-b border-gray-100 p-2 font-medium text-gray-800">{candidate.label}<span className="mt-1 block font-normal text-gray-500">{candidate.learned ? 'Learned model' : 'Benchmark'}{candidate.id === study.selectedId ? ' · selected on validation' : ''}</span></th>
        {[candidate.validation?.mae, candidate.test?.mae, candidate.test?.rmse, candidate.test?.bias, candidate.test?.activeWeekMAE].map((value, i) => <td key={i} className="border-b border-gray-100 p-2 tabular-nums">{value == null ? 'Unavailable' : value.toFixed(2)}</td>)}
      </tr>)}</tbody>
    </table></div>
    {study.candidates.filter(candidate => candidate.unavailable).map(candidate => <p key={candidate.id} className="mt-2 text-xs text-amber-800">{candidate.label}: {candidate.unavailable}</p>)}
    <p className="mt-4 text-sm font-medium text-gray-800">Validation-selected learned candidate: {study.selectedLabel ?? 'Unavailable'}{study.selectedEstimate === null ? '' : ` · full-week estimate ${study.selectedEstimate.toFixed(1)} requests for the target dates above`}.</p>
    <p className="mt-2 text-xs leading-relaxed text-gray-500">This does not automatically replace Ridge or enable production forecasting. Benchmarks are excluded from learned-candidate selection, so a selected model can still lose to a benchmark. A validation selection is not a claim of statistical superiority.</p>
    <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">Eligible history contains {study.observedRequests} requests across {study.activeWeeks} active weeks and {study.zeroWeeks} zero-count weeks. Zero-heavy periods can make an always-zero forecast look good; inspect active-week error as well.</div>
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-semibold text-gray-800">Compare predictions week by week</summary>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs">
        <caption className="mb-3 text-left text-gray-500">Later development backtest predictions. Each method sees only earlier observations when fitting.</caption>
        <thead><tr>{['Week starts', 'Actual', ...study.candidates.map(candidate => candidate.label)].map(label => <th key={label} className="border-b border-gray-200 p-2 font-semibold text-gray-500">{label}</th>)}</tr></thead>
        <tbody>{study.predictions.map(row => <tr key={row.weekStart}><th scope="row" className="border-b border-gray-100 p-2">{row.weekStart}</th><td className="border-b border-gray-100 p-2">{row.actual}</td>{study.candidates.map(candidate => <td key={candidate.id} className="border-b border-gray-100 p-2 tabular-nums">{row.forecasts[candidate.id]?.toFixed(2) ?? 'Unavailable'}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
    <p className="mt-4 text-xs leading-relaxed text-amber-900">These development periods have already been inspected during prototyping. The comparison is exploratory, not a fresh independent test of real demand. A new real-data evaluation is required before deployment decisions.</p>
  </section>;
}

export function ReferralForecastView({ forecast }: { forecast: StatisticsReport['referrals']['forecast'] }) {
  const metrics = forecast.metrics;
  return <Card className="p-5 sm:p-6">
    <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Prototype evaluation on test data</p>
    <h3 className="mt-2 text-lg font-semibold text-gray-900">Referral demand forecasting</h3>
    <p className="mt-2 text-sm text-gray-600">Synthetic/development demo only. This learned model uses weekly request counts and must not be used for real staffing or student-demand decisions.</p>
    {forecast.status !== 'ready' || !metrics || !forecast.forecast ? <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
      <p>{forecast.message}</p><p className="mt-2 text-xs text-gray-500">{forecast.weeks} eligible complete weeks; at least {forecast.requiredWeeks} are required for this prototype. Try a longer custom date range. This minimum allows a test run; it does not establish reliable forecasting.</p>
    </div> : <>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-lg bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-950">Ridge estimate: week of {forecast.forecast.weekStart}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{forecast.forecast.requests.toFixed(1)}</p>
          <p className="mt-2 text-xs text-gray-600">Full-week estimate for {forecast.forecast.weekStart} through {forecast.forecast.weekEnd}. Fractional values represent an expected count.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="mb-3 text-left text-xs text-gray-600">Prediction error on {metrics.testWeeks} later test weeks. Lower is better; units are requests per week.</caption>
            <thead><tr>{['Method', 'MAE', 'RMSE'].map(label => <th key={label} className="border-b border-gray-200 p-2 text-xs font-semibold text-gray-500">{label}</th>)}</tr></thead>
            <tbody>{[['Learned ridge regression', metrics.modelMAE, metrics.modelRMSE], ['Same as last week (baseline)', metrics.baselineMAE, metrics.baselineRMSE]].map(([label, mae, rmse]) => <tr key={label}>
              <th scope="row" className="border-b border-gray-100 p-2 font-medium text-gray-700">{label}</th>
              <td className="border-b border-gray-100 p-2 tabular-nums">{Number(mae).toFixed(2)}</td><td className="border-b border-gray-100 p-2 tabular-nums">{Number(rmse).toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
          <p className="mt-3 text-sm font-medium text-gray-700">{metrics.comparison === 'model-better' ? 'The learned model has lower MAE on these test weeks.' : metrics.comparison === 'baseline-better' ? 'The baseline has lower MAE on these test weeks; the learned model has not improved on it.' : 'The learned model and baseline have equal MAE on these test weeks.'}</p>
          <p className="mt-2 text-xs text-gray-500">MAE is the average absolute miss. RMSE gives larger misses more weight. These are measured errors, not an accuracy percentage.</p>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-gray-500">Training history: {forecast.trainingStart} through {forecast.trainingEnd} ({forecast.weeks} complete weeks). The target follows the last training week, so it may be current or historical depending on your selected dates. No current partial-week count is used.</p>
      <details className="mt-5 border-t border-gray-200 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-800">Weekly test predictions and model details</summary>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs">
          <caption className="mb-3 text-left text-gray-500">One-week-ahead predictions, each fitted only on weeks before its test week.</caption>
          <thead><tr>{['Test week starts', 'Actual requests', 'Model prediction', 'Baseline prediction', 'Trained through'].map(label => <th key={label} className="border-b border-gray-200 p-2 font-semibold text-gray-500">{label}</th>)}</tr></thead>
          <tbody>{forecast.evaluation.map(row => <tr key={row.weekStart}>{[row.weekStart, row.actual, row.predicted.toFixed(2), row.baseline, row.trainedThrough].map((value, i) => <td key={i} className="border-b border-gray-100 p-2 tabular-nums">{value}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="mt-4 text-xs leading-relaxed text-gray-500">Model: ridge regression with two weekly lags and a fixed regularization strength of 1. Feature scaling is fitted on training rows only. The final {metrics.testWeeks} weeks are evaluated sequentially with expanding training history, starting with {metrics.initialTrainingRows} fitting rows. No test errors are used to tune settings. The displayed estimate comes from a final refit on all {forecast.weeks} complete weeks; predictions are constrained to nonnegative counts.</p>
        {forecast.model && <p className="mt-2 text-xs text-gray-500">Fitted equation before nonnegative clipping: {forecast.model.intercept.toFixed(4)} + ({forecast.model.coefficients[0].toFixed(4)} × previous week) + ({forecast.model.coefficients[1].toFixed(4)} × two weeks ago).</p>}
      </details>
      <ForecastComparison study={forecast.comparisonStudy} />
    </>}
    <p className="mt-4 text-xs leading-relaxed text-gray-500">This prototype recomputes for the selected campus and date range using complete Monday-to-Sunday weeks, even when the chart is monthly. The first observed week and clipped boundary weeks are excluded. Gaps with no stored requests are treated as zero for this experiment; complete logging is unverified. Test and pilot records are not yet separated. Production forecasting remains disabled.</p>
  </Card>;
}

export function ReferralsView({ report }: { report: StatisticsReport }) {
  const referrals = report.referrals;
  return <div className="flex flex-col space-y-5">
    <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <h3 className="text-sm font-semibold">Development / test-data notice</h3>
      <p className="mt-2 text-sm">Existing request history was confirmed as development/testing data on October 27, 2026. These figures do not establish real student demand.</p>
    </div>
    <section aria-label="Referral request overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Referral requests" value={format(referrals.requests)} detail="Student requests to facilitators, counted once per stored appointment request." />
      <Metric label="Unique requesting students" value={format(referrals.requestingStudents)} detail="Distinct recorded student accounts; repeat requests still count separately in the request total." />
      <Metric label="Pending requests" value={format(referrals.pending)} detail="Requests in this creation period that are currently awaiting a facilitator decision." />
      <Metric label="Currently accepted" value={format(referrals.accepted)} detail="Current accepted status only. Completed, cancelled and no-show requests appear separately below." />
    </section>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Current request statuses</h3>
        <p className="mt-1 text-sm text-gray-500">Requests created in the selected period, grouped by their status when data was fetched.</p>
        <div className="mt-6"><Bars unit="Referral requests by current status (request count)" rows={referrals.statuses.filter(row => row.requests > 0).map(row => ({ label: row.label, value: row.requests }))} /></div>
        <p className="mt-5 text-xs leading-relaxed text-gray-500">Reschedule requests are separate from declines. Completed and no-show are appointment outcomes. Historical decisions cannot be reconstructed from current statuses.</p>
      </Card>
      <Card className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">{report.filters.interval === 'weekly' ? 'Weekly' : 'Monthly'} referral requests</h3>
        <p className="mt-1 text-sm text-gray-500">Request counts by creation date in Asia/Manila. Each row shows its period and number of requests.</p>
        <div className="mt-6 max-h-96 overflow-y-auto pr-2"><Bars color="bg-slate-700" unit="Referral requests over time (period, request count)" rows={referrals.trends.map(bucket => ({ label: bucket.label, value: bucket.requests, note: bucket.partial ? `Partial: ${bucket.startDate} to ${bucket.endDate}` : undefined }))} /></div>
        <p className="mt-5 text-xs leading-relaxed text-gray-500">Zero means no stored requests for that interval. It does not verify zero demand or complete logging. Rescheduling an existing request does not create a new referral count.</p>
      </Card>
    </div>
  </div>;
}

export function ParticipationView({ report }: { report: StatisticsReport }) {
  const totals = report.totals;
  const topParticipation = [...report.assessmentCohorts].sort((a, b) => b.participatingStudents - a.participatingStudents)[0];
  const qualityIssues = report.attemptDataQuality.invalidRecords + report.attemptDataQuality.duplicateLogicalAttempts;
  const accountActivity = report.accountActivity;
  return <div className="space-y-5">
    <Card className="border-red-100 bg-red-50/60 p-5 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900">Assessment analytics summary</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-700">
        In the selected period, <strong>{format(totals.assessmentStudents)}</strong> students submitted assessments across <strong>{format(totals.attempts)}</strong> valid attempts, including <strong>{format(totals.retakes)}</strong> retakes. <strong>{format(totals.submissions)}</strong> attempts were submitted, for a <strong>{format(totals.completionRate, '%')}</strong> student-assessment completion rate.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-gray-600">
        {topParticipation ? `${topParticipation.title} has the highest participation with ${topParticipation.participatingStudents.toLocaleString()} students.` : 'There is insufficient assessment activity to identify a leading assessment.'}
        {' '}{totals.inProgress ? `${totals.inProgress.toLocaleString()} valid attempts remain in progress.` : 'No valid attempts are currently in progress.'}
        {' '}{qualityIssues ? `${qualityIssues.toLocaleString()} invalid or duplicate records are excluded from headline metrics.` : 'No invalid or duplicate attempt records were detected.'}
      </p>
    </Card>
    <section aria-label="Participation overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Participating students" value={format(totals.participants)} detail="Distinct students across requests, messages and assessment submissions." />
      <Metric label="Requesting appointments" value={format(totals.appointmentStudents)} detail={`${totals.appointmentRequests} requests created in this period.`} />
      <Metric label="Engaging in messaging" value={format(totals.messagingStudents)} detail="Students who sent eligible messages." />
      <Metric label="Assessment attempts" value={format(totals.attempts)} detail={`${totals.submissions} submitted, including retakes, from ${totals.assessmentStudents} students.`} />
      <Metric label="In progress" value={format(totals.inProgress)} detail="Valid started attempts without a submitted or graded status." />
      <Metric label="Retakes" value={format(totals.retakes)} detail="Valid attempts after each student's first attempt for an assessment." />
      <Metric label="Submission rate" value={format(totals.submissionRate, '%')} detail={`${totals.submissions} submitted attempts of ${totals.attempts} valid starts.`} />
      <Metric label="Average attempts / student" value={format(totals.averageAttemptsPerStudent)} detail="Valid starts divided by distinct assessment starters." />
      <Metric label="Completion rate" value={format(totals.completionRate, '%')} detail={`${totals.completedStarters} of ${totals.starters} assessment starters completed at least one attempt.`} />
    </section>
    <section aria-label="User and facilitator activity" className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">User and facilitator activity</h3>
        <p className="mt-1 text-sm text-gray-500">Account and accepted-link metrics are current snapshots. Request-recipient activity follows this tab's selected period.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Student accounts" value={format(accountActivity.studentAccounts)} detail="Current student accounts at the selected campus." />
        <Metric label="Active student accounts" value={format(accountActivity.activeStudentAccounts)} detail={accountActivity.studentsWithUnknownActiveStatus ? accountActivity.studentsWithUnknownActiveStatus + ' student accounts have no readable active status.' : 'Current isActive status across student accounts.'} />
        <Metric label="Facilitator accounts" value={format(accountActivity.facilitatorAccounts)} detail="Current facilitator accounts at the selected campus." />
        <Metric label="Active facilitator accounts" value={format(accountActivity.activeFacilitatorAccounts)} detail={accountActivity.facilitatorsWithUnknownActiveStatus ? accountActivity.facilitatorsWithUnknownActiveStatus + ' facilitator accounts have no readable active status.' : 'Current isActive status across facilitator accounts.'} />
        <Metric label="Currently accepted student links" value={format(accountActivity.acceptedStudentLinks)} detail="Unique accepted facilitator-student relationships in the current link records." />
        <Metric label="Facilitators with accepted student links" value={format(accountActivity.facilitatorsWithAcceptedStudents)} detail="Distinct facilitators connected to at least one currently accepted student link." />
        <Metric label="Facilitators receiving appointment requests" value={format(accountActivity.facilitatorsWithRequests)} detail="Distinct facilitator accounts with a student request in the selected period." />
      </div>
      <div className="max-w-2xl">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Current account mix</h4>
        <AnalyticsDonut title="Current student and facilitator accounts by role" rows={[
          { label: 'Student accounts', value: accountActivity.studentAccounts },
          { label: 'Facilitator accounts', value: accountActivity.facilitatorAccounts },
        ]} />
      </div>
      <p className="text-xs leading-relaxed text-gray-500">Campus selection uses each account's current campus; accepted links are current status records and are grouped by the linked student's current campus. Request recipients use appointment request dates and saved campus, with current student campus as the existing fallback. Active counts are unavailable when an account lacks a boolean isActive field.</p>
    </section>
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h3 className="text-lg font-semibold text-gray-900">Campus participation</h3><p className="mt-1 text-sm text-gray-500">Compare participation and use of each connection feature.</p></div>
        <div className="rounded-lg bg-red-50 px-4 py-3 text-right">
          <p className="text-xl font-bold text-red-800">{format(totals.participationRate, '%')}</p>
          <p className="text-xs text-red-800">{totals.participants} / {totals.registered} known registered students</p>
          <p className="mt-1 text-xs text-gray-500">Estimated portal participation rate</p>
        </div>
      </div>
      <div className="mt-6 grid gap-7 lg:grid-cols-2">
        <div>
          <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Participation share</h4>
          <Donut label="Participating students by campus" rows={report.participation.map(row => ({ label: campusLabel(row.campus, row.label), value: row.participants }))} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Campus activity counts and registered-student participation rates</caption>
            <thead><tr>{['Campus', 'Requests', 'Messages', 'Assessments', 'Registered', 'Rate'].map(label => <th key={label} className="border-b border-gray-200 p-2 font-semibold text-gray-500">{label}</th>)}</tr></thead>
            <tbody>{report.participation.map(row => <tr key={row.campus}>
              <th scope="row" className="border-b border-gray-100 p-2 font-medium text-gray-700">{campusLabel(row.campus, row.label)}</th>
              {[row.appointmentStudents, row.messagingStudents, row.assessmentStudents, row.registered].map((value, index) => <td key={index} className="border-b border-gray-100 p-2 tabular-nums">{format(value)}</td>)}
              <td className="border-b border-gray-100 p-2">{format(row.participationRate, '%')}</td>
            </tr>)}</tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">Activity columns count unique students. Rates use current campus and known registrations; incomplete cohorts show Unavailable. Campus counts may overlap for transferred students.</p>
        </div>
      </div>
    </Card>
    <details className="rounded-xl border border-gray-200 bg-white p-5">
      <summary className="cursor-pointer text-sm font-semibold text-gray-800">Assessment completion details <span className="ml-2 font-normal text-gray-500">{totals.completedStarters} of {totals.starters} starters completed at least one matching attempt</span></summary>
      <p className="mt-3 text-xs text-gray-500">Each definition follows its own start cohort. Earlier starts do not inflate completion rates; unfinished attempts do not establish abandonment.</p>
      {report.assessmentCohorts.length === 0 ? <p className="mt-3 text-sm text-gray-500">No matching assessment starts in this period.</p> : <div className="mt-4 space-y-3">
        <div className="mb-5 max-w-xl">
          <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Completion share</h4>
          <Donut label="Assessment completion share" rows={[
            { label: 'Completed', value: totals.completedStarters },
            { label: 'Not yet submitted', value: totals.incompleteStarters },
          ]} />
        </div>
        <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Assessment comparison</h4>
        <Bars color="bg-red-600" unit="Assessment attempts and submissions" rows={report.assessmentCohorts.flatMap(row => [
          { label: `${row.title} · attempts`, value: row.attempts },
          { label: `${row.title} · submissions`, value: row.submissions },
        ])} />
        <div className="mt-5 space-y-3">{report.assessmentCohorts.map(row => <div key={row.assessmentId} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 pb-3 text-sm">
          <span className="font-medium text-gray-700">{row.title}</span>
          <span className="text-gray-500">{row.participatingStudents} students · {row.attempts} attempts · {row.submissions} submitted · {format(row.submissionRate, '%')} submission rate · {row.inProgress} in progress · {row.retakes} retakes · {row.completed} / {row.starters} completed · {format(row.rate, '%')}</span>
        </div>)}</div>
      </div>}
    </details>
  </div>;
}

export function StatisticsOverviewView({ report, activity, aggregateRows = [], clusteringStatus = null, workloadRows = [] }: {
  report: StatisticsReport;
  activity: TrendActivity;
  aggregateRows?: Array<{
    campusKey: string;
    campusLabel: string;
    periodStartDate: string;
    dataPhase: 'development' | 'real_pilot';
    registeredStudentUsers: { value: number | null; suppressed: boolean; display: string };
    participatingStudents: { value: number | null; suppressed: boolean; display: string };
    appointmentRequests: { value: number | null; suppressed: boolean; display: string };
    assessmentSubmissions: { value: number | null; suppressed: boolean; display: string };
    participationRateBand: string;
    appointmentDemandBand: string;
    assessmentSubmissionBand: string;
  }>;
  clusteringStatus?: {
    status: 'available' | 'disabled';
    enabled: boolean;
    usableRows: number;
    usableCampuses: number;
    stabilityMethod: string;
    k: number;
    publishedMembership: boolean;
    diagnosticLabels: boolean;
    reason: string;
  } | null;
  workloadRows?: any[];
}) {
  const { accountActivity, totals } = report;
  const activeAccounts = accountActivity.activeStudentAccounts === null || accountActivity.activeFacilitatorAccounts === null
    ? null : accountActivity.activeStudentAccounts + accountActivity.activeFacilitatorAccounts;
  const unknownActiveStatuses = accountActivity.studentsWithUnknownActiveStatus + accountActivity.facilitatorsWithUnknownActiveStatus;
  const activeDetail = activeAccounts === null
    ? 'Unavailable because ' + unknownActiveStatuses.toLocaleString() + ' account' + (unknownActiveStatuses === 1 ? '' : 's') + ' have no readable active status.'
    : 'Current isActive status across student and facilitator accounts.';
  const intervalLabel = report.filters.interval === 'daily' ? 'Daily' : report.filters.interval === 'weekly' ? 'Weekly' : 'Monthly';

  // Publish score bands only for assessments whose existing disclosure checks released every band.
  const releasedScoreDistributions = report.gradedScores.filter(score =>
    !score.suppressed && score.bins.length > 0 && score.bins.every(bin => bin.count !== null));
  const scoreBandRows = releasedScoreDistributions[0]?.bins.map(bin => ({
    label: bin.label + '%',
    value: releasedScoreDistributions.reduce((sum, score) =>
      sum + (score.bins.find(candidate => candidate.label === bin.label)?.count ?? 0), 0),
  })) ?? [];
  const meanScoreRows = report.gradedScores
    .filter(score => !score.suppressed && score.mean !== null)
    .map(score => ({ label: score.title, value: score.mean as number, detail: '% · ' + format(score.sample) + ' students' }));
  const withheldScoreDistributions = releasedScoreDistributions.length < report.gradedScores.length;
  const latestAggregatePeriod = aggregateRows.reduce((latest, row) =>
    !latest || row.periodStartDate > latest ? row.periodStartDate : latest, '');
  const latestAggregateRows = latestAggregatePeriod
    ? aggregateRows.filter(row => row.periodStartDate === latestAggregatePeriod)
    : [];

  return <div className="space-y-5">
    {totals.participants === 0 && <p role="status" className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No participation activity was recorded for this campus and period. Current account totals and each chart's data availability are shown separately.</p>}
    <section aria-label="Key account metrics" className="order-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Total students" value={format(accountActivity.studentAccounts)} detail="Current student accounts at the selected campus." />
      <Metric label="Total facilitators" value={format(accountActivity.facilitatorAccounts)} detail="Current facilitator accounts at the selected campus." />
      <Metric label="Active accounts" value={format(activeAccounts)} detail={activeDetail} />
      <Metric label="Accepted student-facilitator links" value={format(accountActivity.acceptedStudentLinks)} detail="Unique links whose current stored status is accepted." />
      <Metric label="Facilitators receiving appointment requests" value={format(accountActivity.facilitatorsWithRequests)} detail="Distinct facilitators with a request in the selected period." />
    </section>

    <section aria-label="Participation summary" className="order-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Participating students" value={format(totals.participants)} detail="Distinct students active in at least one supported portal activity." />
      <Metric label="Assessment completion rate" value={format(totals.completionRate, '%')} detail={totals.starters ? totals.completedStarters.toLocaleString() + ' of ' + totals.starters.toLocaleString() + ' student-assessment starters completed.' : 'No assessment starters in the selected period.'} />
      <Metric label="Valid assessment attempts" value={format(totals.attempts)} detail={totals.submissions.toLocaleString() + ' submitted; retakes are included.'} />
      <Metric label="Students submitting assessments" value={format(totals.assessmentStudents)} detail="Distinct students with a valid assessment submission in this period." />
    </section>

    <section aria-label="Campus operational matrix and heatmap" className="order-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Campus operational heatmap</h3>
            <p className="mt-1 text-sm text-gray-500">Monthly campus-level activity. Synthetic operational demo with project-approved cutoffs.</p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Synthetic demo cutoffs</span>
        </div>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Synthetic / development data — not real student demand or operational pilot results.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-1 pr-4">Campus</th>
                <th className="px-3 pb-1">Registered app users</th>
                <th className="px-3 pb-1">Participation</th>
                <th className="px-3 pb-1">Appointment demand</th>
                <th className="px-3 pb-1">Assessment completion</th>
              </tr>
            </thead>
            <tbody>
              {latestAggregateRows.map(row => <tr key={row.campusKey}>
                <th scope="row" className="pr-4 text-left font-semibold text-gray-800">{row.campusLabel}</th>
                <td className="px-3 py-2 text-gray-700">{row.registeredStudentUsers.display}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.participationRateBand === 'Adequate' ? 'bg-emerald-100 text-emerald-900' : row.participationRateBand === 'Moderate' ? 'bg-amber-100 text-amber-900' : row.participationRateBand === 'Limited' ? 'bg-slate-100 text-slate-700' : 'bg-gray-100 text-gray-500'}`}>{row.participationRateBand}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.appointmentDemandBand === 'Low' ? 'bg-emerald-100 text-emerald-900' : row.appointmentDemandBand === 'Moderate' ? 'bg-amber-100 text-amber-900' : row.appointmentDemandBand === 'High' ? 'bg-red-100 text-red-900' : 'bg-gray-100 text-gray-500'}`}>{row.appointmentDemandBand}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.assessmentSubmissionBand === 'Adequate' ? 'bg-emerald-100 text-emerald-900' : row.assessmentSubmissionBand === 'Moderate' ? 'bg-amber-100 text-amber-900' : row.assessmentSubmissionBand === 'Limited' || row.assessmentSubmissionBand === 'Low' ? 'bg-slate-100 text-slate-700' : 'bg-gray-100 text-gray-500'}`}>{row.assessmentSubmissionBand}</span>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {latestAggregateRows.length === 0 && <p className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">No locked campus aggregate is available for the latest period. The heatmap will not use raw source records as a substitute.</p>}
        <p className="mt-3 text-xs leading-relaxed text-gray-500">Counts from 1 to 4 are shown only as “Fewer than 5.” Gray means unavailable or insufficient denominators, not confirmed low activity. Campus rates use registered app users, not official enrollment.</p>
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Operational support matrix</h3>
        <p className="mt-1 text-sm text-gray-500">Assessment completion and appointment demand determine a campus-level planning label.</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[390px] border-collapse text-xs">
            <thead>
              <tr>
                <th className="border-b border-gray-200 p-2 text-left text-gray-500">Completion / demand</th>
                <th className="border-b border-gray-200 p-2 text-gray-600">Low</th>
                <th className="border-b border-gray-200 p-2 text-gray-600">Moderate</th>
                <th className="border-b border-gray-200 p-2 text-gray-600">High</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Limited', 'Standard monitoring', 'Monitor capacity', 'Priority capacity review'],
                ['Moderate', 'Standard monitoring', 'Operational review', 'Priority capacity review'],
                ['Adequate', 'Operational review', 'Priority capacity review', 'Priority capacity review'],
                ['Insufficient data', 'Insufficient data', 'Insufficient data', 'Insufficient data'],
              ].map(row => <tr key={row[0]}>
                <th scope="row" className="border-b border-gray-100 p-2 text-left text-gray-700">{row[0]}</th>
                {row.slice(1).map((label, index) => <td key={index} className="border-b border-gray-100 p-2 text-center text-gray-700">{label}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          This matrix is explanatory and operational only. It does not diagnose or rank student wellbeing.
          {clusteringStatus?.enabled
            ? ` A LOCO stability check passed for this synthetic dataset (${clusteringStatus.usableRows} rows across ${clusteringStatus.usableCampuses} campuses).`
            : ' Campus clustering remains disabled or awaiting the stability gate.'}
          {' '}Cutoffs are project-approved for the synthetic operational demo only.
        </p>
      </Card>
    </section>

    <section aria-label="Clustering and facilitator workload" className="order-7 grid gap-5 xl:grid-cols-2">
      <Card className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Campus pattern stability</h3>
        <p className="mt-1 text-sm text-gray-500">Exploratory campus-period patterns, not student diagnosis or ranking.</p>
        {clusteringStatus ? <div className="mt-4 space-y-3">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${clusteringStatus.enabled ? 'bg-emerald-100 text-emerald-900' : 'bg-gray-100 text-gray-600'}`}>
            {clusteringStatus.enabled ? 'Release gate passed' : 'Clustering disabled'}
          </span>
          <p className="text-sm text-gray-700">{clusteringStatus.reason}</p>
          <p className="text-xs text-gray-500">{clusteringStatus.usableRows} usable rows · {clusteringStatus.usableCampuses} campuses · method: {clusteringStatus.stabilityMethod} · k: {clusteringStatus.k}</p>
        </div> : <p className="mt-4 text-sm text-gray-500">Clustering status is not yet published.</p>}
      </Card>
      <Card className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Facilitator capacity</h3>
        <p className="mt-1 text-sm text-gray-500">See the dedicated Facilitator Staffing tab for campus severity and planning estimates.</p>
      </Card>
    </section>

    <section aria-label="Statistics overview visualizations" className="-order-[20] space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Key visualizations</h3>
        <p className="mt-1 text-sm text-gray-500">A quick visual overview before detailed account metrics and campus tables.</p>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Account distribution</h3>
        <p className="mt-1 text-sm text-gray-500">Current student and facilitator accounts for the selected campus.</p>
        <div className="mt-5"><AnalyticsDonut title="Current account distribution by role" rows={[
          { label: 'Students', value: accountActivity.studentAccounts },
          { label: 'Facilitators', value: accountActivity.facilitatorAccounts },
        ]} /></div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">{intervalLabel} activity trend</h3>
        <p className="mt-1 text-sm text-gray-500">{activityLabels[activity]}; students may appear in multiple time buckets.</p>
        <div className="mt-5"><AnalyticsLineChart title={intervalLabel + ' ' + activityLabels[activity].toLowerCase()} rows={report.trends.map(bucket => ({ label: bucket.label, value: bucket[activity] }))} /></div>
      </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Assessment completion</h3>
        <p className="mt-1 text-sm text-gray-500">Completion among distinct student-assessment starters for the selected period.</p>
        <div className="mt-5"><AnalyticsDonut title="Assessment completion among starters" rows={[
          { label: 'Completed', value: totals.completedStarters },
          { label: 'Started but not completed', value: totals.incompleteStarters },
        ]} /></div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900">Graded score distribution</h3>
        <p className="mt-1 text-sm text-gray-500">Latest valid graded percentages per student and assessment.</p>
        {scoreBandRows.length
          ? <div className="mt-5"><AnalyticsDonut title="Released graded score records by percentage band" rows={scoreBandRows} /><p className="mt-3 text-xs leading-relaxed text-gray-500">Counts represent grade records, not unique students across assessments. Assessments or bands withheld by the existing five-student disclosure rules are omitted.</p></div>
          : <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No score-band distributions are available for this selection. Groups below the privacy threshold and sparse bands are withheld.</p>}
        {meanScoreRows.length > 0 && <div className="mt-5 border-t border-gray-100 pt-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mean score by assessment (%)</h4>
          <AnalyticsBars title="Mean valid graded percentage by assessment" rows={meanScoreRows} />
        </div>}
        {withheldScoreDistributions && <p className="mt-3 text-xs text-gray-500">Some assessment distributions are omitted to preserve the existing five-student and sparse-band disclosure thresholds.</p>}
      </Card>
    </section>
  </div>;
}

export function TrendsView({ report, activity }: { report: StatisticsReport; activity: TrendActivity }) {
  return <div className="space-y-5">
    <section aria-label="Trend period totals" className="grid gap-4 sm:grid-cols-3">
      <Metric label="Participating students" value={format(report.totals.participants)} detail="Distinct students across the entire selected period." />
      <Metric label="Appointment requests" value={format(report.totals.appointmentRequests)} detail="Requests created during this period." />
      <Metric label="Assessment submissions" value={format(report.totals.submissions)} detail={`${report.totals.assessmentStudents} unique submitting students.`} />
    </section>
    <Card className="p-5 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900">{activityLabels[activity]}</h3>
      <p className="mt-1 text-sm text-gray-500">{report.filters.interval === 'daily' ? 'Daily' : report.filters.interval === 'weekly' ? 'Weekly' : 'Monthly'} activity in this tab's reporting period.</p>
      {report.filters.interval === "daily" ? <div className="mt-6"><Bars color="bg-slate-700" unit={activityLabels[activity]} rows={report.trends.map(bucket => ({ label: bucket.label, value: bucket[activity], note: bucket.partial ? "Partial interval" : undefined }))} /></div> : <div className="mt-6"><AnalyticsLineChart title={activityLabels[activity]} rows={report.trends.map(bucket => ({ label: bucket.label, value: bucket[activity] }))} />{report.trends.some(bucket => bucket.partial) && <p className="mt-2 text-xs text-gray-500">Partial intervals: {report.trends.filter(bucket => bucket.partial).map(bucket => bucket.label).join(", ")}.</p>}</div>}
      {activity === 'attempts' && <p className="mt-4 text-xs text-gray-500">Retake activity in this period: {report.trends.reduce((sum, bucket) => sum + bucket.retakes, 0).toLocaleString()} of {report.totals.attempts.toLocaleString()} attempts.</p>}
      <p className="mt-5 text-xs leading-relaxed text-gray-500">A student can appear in multiple buckets; bucket counts do not add up to a unique period total. Current periods stop at report generation time.</p>
    </Card>
  </div>;
}

export function GradedAssessmentScoresView({ report }: { report: StatisticsReport }) {
  return <Card className="p-5 sm:p-6">
    <h3 className="text-lg font-semibold text-gray-900">Graded assessment score distributions</h3>
    <p className="mt-1 text-sm text-gray-500">Stored percentage grades, using the latest valid graded attempt per student and assessment in the selected period.</p>
    {report.gradedScores.length === 0 ? <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No valid graded percentage scores match these filters.</p> : <div className="mt-5 space-y-6">
      {report.gradedScores.map(score => <section key={score.assessmentId} aria-label={score.title + ' graded scores'} className="border-t border-gray-100 pt-5 first:border-0 first:pt-0">
        <h4 className="font-semibold text-gray-800">{score.title}</h4>
        {score.suppressed ? <p className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Fewer than five students have a valid graded score for this assessment; exact summaries and distribution are withheld.</p> : <>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[["Students", format(score.sample)], ["Mean", format(score.mean, '%')], ["Median", format(score.median, '%')]].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 text-xl font-semibold text-gray-900">{value}</dd></div>)}
          </dl>
          {score.bins.some(bin => bin.count === null) ? <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">The score-band distribution is withheld because a nonzero band has fewer than five students.</p> : <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div><h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Score bands</h5><AnalyticsDonut title={score.title + ' graded score bands'} rows={score.bins.map(bin => ({ label: bin.label + '%', value: bin.count ?? 0 }))} /></div>
            <div><h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Students by score band</h5><AnalyticsBars title={score.title + ' students by graded score band'} rows={score.bins.map(bin => ({ label: bin.label + '%', value: bin.count ?? 0 }))} /></div>
          </div>}
        </>}
      </section>)}
    </div>}
    {report.coverage.invalidGradedScoreRecords > 0 && <p className="mt-4 text-xs text-amber-800">Excluded {report.coverage.invalidGradedScoreRecords.toLocaleString()} graded records with an invalid percentage or missing assessment definition.</p>}
    {report.coverage.earlierValidGradedScoreFallbacks > 0 && <p className="mt-2 text-xs text-gray-500">For {report.coverage.earlierValidGradedScoreFallbacks.toLocaleString()} students, the latest graded record had an invalid percentage, so the most recent earlier valid grade is shown.</p>}
    <p className="mt-5 text-xs leading-relaxed text-gray-500">Only status=graded records with numeric percentages from 0 to 100 are included. Scores are grouped per assessment; no cross-assessment pass mark or combined average is assumed. Groups and score bands follow the existing five-student disclosure threshold.</p>
  </Card>;
}

export function ScoresView({ report, instrument, version, focusedCampus, onVersionChange, onCampusChange }: {
  report: StatisticsReport; instrument: string; version: string; focusedCampus: string;
  onVersionChange: (version: string) => void; onCampusChange: (campus: string) => void;
}) {
  const versions = [...new Set(report.scores.filter(score => score.instrument === instrument).map(score => score.version))];
  const selectedVersion = versions.includes(version) ? version : versions[0] ?? '';
  const scores = report.scores.filter(score => score.instrument === instrument && score.version === selectedVersion);
  const focused = scores.find(score => score.campus === focusedCampus) ?? scores.find(score => !score.suppressed) ?? scores[0];
  return <Card className="p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h3 className="text-lg font-semibold text-gray-900">{instrument} score overview</h3><p className="mt-1 text-sm text-gray-500">Latest valid responses per student. Choose a campus to inspect its distribution.</p></div>
      {versions.length > 0 && <label className="min-w-0 text-sm text-gray-700">Scoring version / definition
        <select className={control} value={selectedVersion} onChange={event => onVersionChange(event.target.value)}>
          {versions.map(value => <option key={value} value={value}>{value === 'standard-v1' ? 'Standard v1' : `Unversioned · ${report.assessments.find(assessment => assessment.id === value.replace('unversioned:', ''))?.title ?? 'Historical definition'}`}</option>)}
        </select>
      </label>}
    </div>
    {selectedVersion.startsWith('unversioned:') && <p className="mt-3 text-xs text-amber-800">Scores use this definition's current question set. Its scoring version is unverified, so results remain separate from other definitions.</p>}
    {!focused ? <p className="mt-5 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No usable {instrument} scores match these filters. Incomplete answers and unsupported definitions are excluded.</p> : <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Campus comparison</h4>
        <div className="space-y-2" aria-label="Select a campus distribution">
          {scores.map(score => <button type="button" key={score.campus} aria-pressed={score.campus === focused.campus} onClick={() => onCampusChange(score.campus)} className={`w-full rounded-lg border p-4 text-left focus:outline-none focus:ring-2 focus:ring-red-200 ${score.campus === focused.campus ? 'border-red-200 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <span className="block text-sm font-semibold text-gray-800">{campusLabel(score.campus, score.label)}</span>
            <span className="mt-1 block text-xs text-gray-500">{score.suppressed ? 'Not enough participants to show scores' : `${score.sample} students · median ${format(score.median)} · Q1–Q3 ${format(score.q1)}–${format(score.q3)}`}</span>
          </button>)}
        </div>
      </div>
      <div className="min-w-0 rounded-xl bg-gray-50 p-5">
        <h4 className="font-semibold text-gray-800">{campusLabel(focused.campus, focused.label)}</h4>
        {focused.suppressed ? <p className="mt-4 text-sm text-gray-500">Not enough participants to display this group. Score summaries require at least 5 students.</p> : <>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[['Students', format(focused.sample)], ['Median', format(focused.median)], ['Q1–Q3', `${format(focused.q1)}–${format(focused.q3)}`], ['Mean', format(focused.mean)]].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 text-xl font-semibold text-gray-900">{value}</dd></div>)}
          </dl>
          <p className="my-5 text-xs text-gray-500">Numeric range 0–{focused.max}{focused.max === 42 ? ' · doubled DASS-21 subscale sum' : ''}</p>
          {focused.bins.some(bin => bin.count === null) ? <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Distribution withheld because one or more nonzero bins have fewer than 5 students. All bins are hidden to reduce disclosure through subtraction.</p> : <div className="space-y-5">
            <Donut label={`${instrument} score distribution for ${focused.label}`} rows={focused.bins.map(bin => ({ label: bin.label, value: bin.count ?? 0 }))} />
            <Bars color="bg-teal-600" unit="Students per numeric score range" rows={focused.bins.map(bin => ({ label: bin.label, value: bin.count ?? 0 }))} />
          </div>}
        </>}
      </div>
    </div>}
    <p className="mt-6 text-xs leading-relaxed text-gray-500">Scores describe voluntary submitted responses. They do not diagnose students, prescribe treatment, or rank campus wellbeing.</p>
  </Card>;
}

export function FacilitatorStaffingView({ report, workloadRows = [] }: {
  report: StatisticsReport;
  workloadRows?: any[];
}) {
  const selectedCampus = report.filters.campus;
  const campusKeys = [...new Map<string, string>([
    ...ALL_CAMPUSES.map((key): [string, string] => [key, getCampusLabel(key)]),
    ...(report.campuses ?? []).map((campus): [string, string] => [campus.key, campus.label]),
  ]).entries()];
  const syntheticMonthlyRequests: Record<string, number> = {
    pablo_borbon: 8,
    alangilan: 14,
    arasof_nasugbu: 24,
    jplpc_malvar: 5,
    lipa: 18,
  };
  const usingSyntheticFallback = workloadRows.length === 0;
  const syntheticWorkloadRows = campusKeys.map(([key, label], index) => ({
      id: `synthetic-${key}`,
      campusKey: key,
      campusLabel: label,
      facilitatorCount: { value: 5, suppressed: false, display: '5' },
      activeAvailabilitySlots: { value: 10, suppressed: false, display: '10' },
      monthlyRequests: {
        value: syntheticMonthlyRequests[key] ?? 12 + index * 3,
        suppressed: false,
        display: String(syntheticMonthlyRequests[key] ?? 12 + index * 3),
      },
    }));
  const effectiveWorkloadRows = usingSyntheticFallback
    ? syntheticWorkloadRows
    : [...workloadRows, ...syntheticWorkloadRows.filter(synthetic =>
      !workloadRows.some(row => row.campusKey === synthetic.campusKey))];
  const hasSyntheticSelectedCampus = selectedCampus
    && !workloadRows.some(row => row.campusKey === selectedCampus);
  const allCampusRows = effectiveWorkloadRows.map(row => {
    const monthlyRequests = row.monthlyRequests?.value;
    const predictedWeeklyRequests = Number.isFinite(monthlyRequests)
      ? monthlyRequests / 4.345
      : null;
    return {
      row,
      staffing: estimateCampusFacilitatorNeed({
        predictedWeeklyRequests,
        activeFacilitators: row.facilitatorCount?.value ?? null,
        activeAvailabilitySlots: row.activeAvailabilitySlots?.value ?? null,
      }),
    };
  }).filter(item => item.staffing.status === 'ready');
  const allCampusChartRows = allCampusRows.map(({ row, staffing }) => ({
    label: campusLabel(row.campusKey, row.campusLabel),
    value: staffing.recommendedFacilitatorCount ?? 0,
    detail: `${staffing.additionalFacilitators ?? 0} additional`,
  }));
  const allCampusDemandRows = allCampusRows.map(({ row, staffing }) => ({
    label: campusLabel(row.campusKey, row.campusLabel),
    value: Math.round((staffing.predictedWeeklyRequests ?? 0) * 10) / 10,
  }));
  const workload = selectedCampus
    ? effectiveWorkloadRows.find(row => row.campusKey === selectedCampus)
    : null;
  const staffing = workload
    ? estimateCampusFacilitatorNeed({
      predictedWeeklyRequests: (() => {
        const forecast = report.referrals.forecast?.forecast?.requests;
        if (Number.isFinite(forecast) && forecast! >= 0 && !usingSyntheticFallback && !hasSyntheticSelectedCampus) return forecast!;
        const monthly = workload.monthlyRequests?.value;
        return Number.isFinite(monthly) ? monthly / 4.345 : null;
      })(),
      activeFacilitators: workload.facilitatorCount?.value ?? null,
      activeAvailabilitySlots: workload.activeAvailabilitySlots?.value ?? null,
    })
    : null;
  const chartRows = staffing?.status === 'ready'
    ? [
      { label: 'Active facilitators', value: staffing.activeFacilitators ?? 0 },
      { label: 'Recommended facilitators', value: staffing.recommendedFacilitatorCount ?? 0, detail: 'planning estimate' },
      { label: 'Additional needed', value: staffing.additionalFacilitators ?? 0 },
    ]
    : [];

  return <div className="space-y-5">
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Campus facilitator staffing</h3>
          <p className="mt-1 text-sm text-gray-500">Severity and a planning count based on predicted weekly referrals and current availability.</p>
        </div>
        {staffing?.status === 'ready' && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${staffing.severity === 'high' ? 'bg-red-100 text-red-900' : staffing.severity === 'moderate' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
          {staffing.severity} severity
        </span>}
      </div>
      {(usingSyntheticFallback || hasSyntheticSelectedCampus) && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        Synthetic showcase data — published workload coverage is incomplete or unavailable.
      </p>}
      {!selectedCampus
        ? allCampusRows.length
          ? <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Card className="p-4 shadow-none">
              <h4 className="text-sm font-semibold text-gray-900">Recommended facilitators by campus</h4>
              <p className="mt-1 text-xs text-gray-500">Planning estimate; additional facilitators appear beside each value.</p>
              <div className="mt-4"><AnalyticsBars title="Recommended facilitators across campuses" rows={allCampusChartRows} /></div>
            </Card>
            <Card className="p-4 shadow-none">
              <h4 className="text-sm font-semibold text-gray-900">Predicted weekly referrals by campus</h4>
              <p className="mt-1 text-xs text-gray-500">Monthly workload converted to an approximate weekly demand.</p>
              <div className="mt-4"><AnalyticsBars title="Predicted weekly referrals across campuses" rows={allCampusDemandRows} /></div>
            </Card>
            <div className="overflow-x-auto xl:col-span-2">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="border-b border-gray-200 p-3">Campus</th>
                  <th className="border-b border-gray-200 p-3">Severity</th>
                  <th className="border-b border-gray-200 p-3">Active</th>
                  <th className="border-b border-gray-200 p-3">Recommended</th>
                  <th className="border-b border-gray-200 p-3">Additional</th>
                </tr></thead>
                <tbody>{allCampusRows.map(({ row, staffing }) => <tr key={row.id}>
                  <th scope="row" className="border-b border-gray-100 p-3 font-medium text-gray-800">{campusLabel(row.campusKey, row.campusLabel)}</th>
                  <td className="border-b border-gray-100 p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${staffing.severity === 'high' ? 'bg-red-100 text-red-900' : staffing.severity === 'moderate' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{staffing.severity}</span></td>
                  <td className="border-b border-gray-100 p-3 tabular-nums">{staffing.activeFacilitators}</td>
                  <td className="border-b border-gray-100 p-3 tabular-nums">{staffing.recommendedFacilitatorCount}</td>
                  <td className="border-b border-gray-100 p-3 tabular-nums">{staffing.additionalFacilitators}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>
          : <p className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No campus workload aggregates are available to display.</p>
        : !workload
          ? <p className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No published workload aggregate is available for this campus.</p>
          : !staffing || staffing.status !== 'ready'
            ? <p className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">Insufficient forecast or facilitator data to calculate this campus estimate.</p>
            : <div className="mt-5">
              <div className="mb-3 font-medium text-gray-800">{campusLabel(workload.campusKey, workload.campusLabel)}</div>
              <div className="rounded-lg bg-gray-50 p-4">
                <AnalyticsBars title="Campus facilitator staffing comparison" rows={chartRows} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Metric label="Predicted requests" value={format(staffing.predictedWeeklyRequests)} detail="per week" />
                <Metric label="Recommended facilitators" value={format(staffing.recommendedFacilitatorCount)} detail="planning estimate" />
                <Metric label="Additional needed" value={format(staffing.additionalFacilitators)} detail="vs. active facilitators" />
              </div>
            </div>}
      <p className="mt-4 text-xs leading-relaxed text-gray-500">Development-only planning estimate. It does not diagnose students, assign facilitators, set clinical priorities, or remove existing staff. Production forecasting remains disabled.</p>
    </Card>
  </div>;
}

const coverageLabels: Record<string, string> = {
  missingEventDates: 'Records excluded for missing event dates', conflictingDates: 'Conflicting timestamps (canonical preferred)', unknownCampusEvents: 'Activity events with unknown campus', currentCampusFallbackEvents: 'Activity events attributed to current campus', missingRegistrationDates: 'Students with missing registration dates', excludedMessagingRecords: 'Ineligible messaging records', legacySubmissionsSeparate: 'Legacy template submissions (separate from totals)', unversionedSubmissions: 'Submissions without declared scoring version', invalidScoreSubmissions: 'Submissions without any valid supported score', submittingStudentsWithoutScores: 'Submitting students without usable scores', earlierValidFallbacks: 'Score selections using an earlier valid submission', invalidGradedScoreRecords: 'Graded records excluded for invalid percentages or missing definitions', earlierValidGradedScoreFallbacks: 'Students using an earlier valid graded score',
};
export function CoverageDetails({ report, view }: { report: StatisticsReport; view: StatisticsView }) {
  if (view === 'referrals' || view === 'forecast' || view === 'staffing') return <details className="rounded-xl border border-gray-200 bg-white p-5">
    <summary className="cursor-pointer text-sm font-semibold text-gray-800">Referral data coverage & limitations</summary>
    <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">{[
      ['Requests without a usable creation date (campus-scoped source, period unknown)', report.referrals.coverage.missingRequestDates],
      ['Future-dated requests excluded from the selected period', report.referrals.coverage.futureDatedRequests],
      ['Included requests without a request-time campus', report.referrals.coverage.missingCampusSnapshots],
      ['Included requests without a student account ID', report.referrals.coverage.missingStudentIds],
      ['Included requests whose student account is unavailable or has another role', report.referrals.coverage.unknownStudentAccounts],
      ['Included requests with conflicting creation dates (primary date used)', report.referrals.coverage.conflictingDates],
      ['Included requests using a legacy creation date', report.referrals.coverage.legacyDateFallbacks],
    ].map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b border-gray-100 pb-2 text-xs"><dt className="text-gray-500">{label}</dt><dd className="font-semibold tabular-nums text-gray-700">{value}</dd></div>)}</dl>
    <p className="mt-5 text-xs leading-relaxed text-gray-500">Campus filtering uses the campus saved with each request. Missing request-time campuses stay Unknown / Unassigned; a student's current campus is not substituted. Requests remain counted if their student account is unavailable. Unique student counts use recorded IDs and omit requests with no usable student ID. Assessment filters do not affect this report.</p>
  </details>;
  const scoreKeys = new Set(['unversionedSubmissions', 'invalidScoreSubmissions', 'submittingStudentsWithoutScores', 'earlierValidFallbacks', 'invalidGradedScoreRecords', 'earlierValidGradedScoreFallbacks']);
  const coverage = Object.entries(report.coverage).filter(([key]) => view === 'overview' ? true : view === 'scores' ? scoreKeys.has(key) || key === 'unknownCampusEvents' : !scoreKeys.has(key));
  const attemptQuality = Object.entries(report.attemptDataQuality);
  return <details className="rounded-xl border border-gray-200 bg-white p-5">
    <summary className="cursor-pointer text-sm font-semibold text-gray-800">Data coverage & limitations</summary>
    {(view === 'participation' || view === 'trends') && <><h3 className="mt-4 text-sm font-semibold text-gray-800">Assessment record quality</h3><dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">{attemptQuality.map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-b border-gray-100 pb-2 text-xs"><dt className="text-gray-500">{key.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)}</dt><dd className="font-semibold tabular-nums text-gray-700">{value}</dd></div>)}</dl><p className="mt-3 text-xs leading-relaxed text-gray-500">Invalid and duplicate logical attempts are excluded from headline metrics. Valid retakes remain separate attempts.</p></>}
    <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">{coverage.map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-b border-gray-100 pb-2 text-xs"><dt className="text-gray-500">{coverageLabels[key] ?? key}</dt><dd className="font-semibold tabular-nums text-gray-700">{value}</dd></div>)}</dl>
    <ul className="mt-5 list-disc space-y-2 pl-5 text-xs leading-relaxed text-gray-500">{report.notes.map(note => <li key={note}>{note}</li>)}</ul>
  </details>;
}
