import { getCampusLabel, type StatisticsReport } from '@spartan-g/shared-types';
import { Card } from '../ui/Card';

export type StatisticsView = 'participation' | 'trends' | 'scores';
export type TrendActivity = 'participants' | 'appointmentRequests' | 'messagingStudents' | 'submissions' | 'assessmentStudents';
export const activityLabels: Record<TrendActivity, string> = {
  participants: 'Unique participating students', appointmentRequests: 'Appointment requests',
  messagingStudents: 'Unique students sending messages', submissions: 'Assessment submissions',
  assessmentStudents: 'Unique students submitting assessments',
};
export const control = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-100';
export const format = (value: number | null, suffix = '') => value === null ? 'Unavailable' : `${Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)}${suffix}`;
export const campusLabel = (key: string, label: string) => key === label ? getCampusLabel(key) : label;

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
      <div className="h-3 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${row.value / max * 100}%` }} />
      </div>
    </div>)}
  </div>;
}

export function ParticipationView({ report }: { report: StatisticsReport }) {
  const totals = report.totals;
  return <div className="space-y-5">
    <section aria-label="Participation overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Participating students" value={format(totals.participants)} detail="Distinct students across requests, messages and assessment submissions." />
      <Metric label="Requesting appointments" value={format(totals.appointmentStudents)} detail={`${totals.appointmentRequests} requests created in this period.`} />
      <Metric label="Engaging in messaging" value={format(totals.messagingStudents)} detail="Students who sent eligible messages." />
      <Metric label="Submitting assessments" value={format(totals.assessmentStudents)} detail={`${totals.submissions} submissions, including retakes.`} />
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
        {report.assessmentCohorts.map(row => <div key={row.assessmentId} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 pb-3 text-sm">
          <span className="font-medium text-gray-700">{row.title}</span>
          <span className="text-gray-500">{row.completed} / {row.starters} completed · {format(row.rate, '%')} · {row.remaining} not yet submitted</span>
        </div>)}
      </div>}
    </details>
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
      <p className="mt-1 text-sm text-gray-500">{report.filters.interval === 'weekly' ? 'Weekly' : 'Monthly'} activity in this tab's reporting period.</p>
      <div className="mt-6"><Bars color="bg-slate-700" unit={activityLabels[activity]} rows={report.trends.map(bucket => ({ label: bucket.label, value: bucket[activity], note: bucket.partial ? `Partial: ${bucket.startDate} to ${bucket.endDate}` : undefined }))} /></div>
      <p className="mt-5 text-xs leading-relaxed text-gray-500">A student can appear in multiple buckets; bucket counts do not add up to a unique period total. Current periods stop at report generation time.</p>
    </Card>
  </div>;
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

const coverageLabels: Record<string, string> = {
  missingEventDates: 'Records excluded for missing event dates', conflictingDates: 'Conflicting timestamps (canonical preferred)', unknownCampusEvents: 'Activity events with unknown campus', currentCampusFallbackEvents: 'Activity events attributed to current campus', missingRegistrationDates: 'Students with missing registration dates', excludedMessagingRecords: 'Ineligible messaging records', legacySubmissionsSeparate: 'Legacy template submissions (separate from totals)', unversionedSubmissions: 'Submissions without declared scoring version', invalidScoreSubmissions: 'Submissions without any valid supported score', submittingStudentsWithoutScores: 'Submitting students without usable scores', earlierValidFallbacks: 'Score selections using an earlier valid submission',
};
export function CoverageDetails({ report, view }: { report: StatisticsReport; view: StatisticsView }) {
  const scoreKeys = new Set(['unversionedSubmissions', 'invalidScoreSubmissions', 'submittingStudentsWithoutScores', 'earlierValidFallbacks']);
  const coverage = Object.entries(report.coverage).filter(([key]) => view === 'scores' ? scoreKeys.has(key) || key === 'unknownCampusEvents' : !scoreKeys.has(key));
  return <details className="rounded-xl border border-gray-200 bg-white p-5">
    <summary className="cursor-pointer text-sm font-semibold text-gray-800">Data coverage & limitations</summary>
    <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">{coverage.map(([key, value]) => <div key={key} className="flex justify-between gap-3 border-b border-gray-100 pb-2 text-xs"><dt className="text-gray-500">{coverageLabels[key] ?? key}</dt><dd className="font-semibold tabular-nums text-gray-700">{value}</dd></div>)}</dl>
    <ul className="mt-5 list-disc space-y-2 pl-5 text-xs leading-relaxed text-gray-500">{report.notes.map(note => <li key={note}>{note}</li>)}</ul>
  </details>;
}
