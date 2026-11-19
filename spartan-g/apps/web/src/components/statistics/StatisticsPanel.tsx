import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_CAMPUSES, getCampusLabel, type StatisticsFilters, type StatisticsReport } from '@spartan-g/shared-types';
import { loadStatistics, statisticsError } from '../../lib/statistics';
import { loadCampusPeriodAggregates, loadClusteringStatus, loadFacilitatorWorkload, type CampusPeriodAggregate, type ClusteringStatus } from '../../lib/statisticsSource';
import { db } from '../../firebase/firebase';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import { activityLabels, campusLabel, control, CoverageDetails, FacilitatorStaffingView, GradedAssessmentScoresView, ReferralForecastView, ReferralsView, ParticipationView, ScoresView, StatisticsOverviewView, TrendsView, type StatisticsView, type TrendActivity } from './StatisticsViews';

type Period = 'month' | 'week' | 'previous' | 'quarter' | 'year' | 'custom';
const instruments = ['PHQ-9', 'GAD-7', 'DASS-21 depression', 'DASS-21 anxiety', 'DASS-21 stress'];
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
function presetDates(period: Exclude<Period, 'custom'>) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  const year = value('year'), month = value('month') - 1;
  const today = new Date(Date.UTC(year, month, value('day')));
  if (period === 'week') return { startDate: isoDate(new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86400000)), endDate: isoDate(today) };
  if (period === 'previous') return { startDate: isoDate(new Date(Date.UTC(year, month - 1, 1))), endDate: isoDate(new Date(Date.UTC(year, month, 0))) };
  if (period === 'quarter') return { startDate: isoDate(new Date(Date.UTC(year, month - 2, 1))), endDate: isoDate(today) };
  if (period === 'year') return { startDate: isoDate(new Date(Date.UTC(year, month - 11, 1))), endDate: isoDate(today) };
  return { startDate: isoDate(new Date(Date.UTC(year, month, 1))), endDate: isoDate(new Date(Date.UTC(year, month + 1, 0))) };
}
const descriptions: Record<StatisticsView, string> = {
  overview: 'A current snapshot of accounts, participation, assessment completion and performance.',
  referrals: 'How many students request a facilitator, and what are the current statuses of those requests?',
  forecast: 'Explore experimental forecasts of weekly facilitator request volume and compare model errors.',
  staffing: 'Explore campus-level severity and an experimental facilitator staffing estimate.',
  participation: 'Who is using the portal and which connection features are they using?',
  trends: 'How does portal activity change from week to week or month to month?',
  scores: 'What do submitted assessment scores look like across campuses?',
};

/** Each mounted panel owns its filters, selections and report independently. */
export function StatisticsPanel({ view }: { view: StatisticsView }) {
  const [period, setPeriod] = useState<Period>(view === 'referrals' || view === 'forecast' || view === 'staffing' || view === 'overview' ? 'year' : view === 'trends' ? 'quarter' : 'month');
  const [filters, setFilters] = useState<StatisticsFilters>(() => ({ ...presetDates(view === 'referrals' || view === 'forecast' || view === 'staffing' || view === 'overview' ? 'year' : view === 'trends' ? 'quarter' : 'month'), campus: '', assessmentId: '', interval: view === 'trends' || view === 'overview' ? 'monthly' : 'weekly' }));
  const [customDates, setCustomDates] = useState(() => ({ startDate: filters.startDate, endDate: filters.endDate }));
  const [report, setReport] = useState<StatisticsReport | null>(null);
  const [catalogue, setCatalogue] = useState<Pick<StatisticsReport, 'campuses' | 'assessments'>>({ campuses: [], assessments: [] });
  const [aggregateRows, setAggregateRows] = useState<CampusPeriodAggregate[]>([]);
  const [clusteringStatus, setClusteringStatus] = useState<ClusteringStatus | null>(null);
  const [workloadRows, setWorkloadRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [activity, setActivity] = useState<TrendActivity>('participants');
  const [instrument, setInstrument] = useState('PHQ-9');
  const [version, setVersion] = useState('');
  const [focusedCampus, setFocusedCampus] = useState('');
  const sequence = useRef(0);
  const lastRefresh = useRef(refresh);
  useEffect(() => {
    const request = ++sequence.current;
    setReport(null); setError(null); setLoading(true);
    const forceRefresh = refresh !== lastRefresh.current;
    lastRefresh.current = refresh;
    loadStatistics(filters, { forceRefresh }).then(result => {
      if (request === sequence.current) { setReport(result); setCatalogue({ campuses: result.campuses, assessments: result.assessments }); }
    }).catch(cause => {
      if (request === sequence.current) setError(statisticsError(cause));
    }).finally(() => { if (request === sequence.current) setLoading(false); });
    return () => { ++sequence.current; };
  }, [filters, refresh]);
  useEffect(() => {
    if (view !== 'overview' && view !== 'staffing') return;
    let active = true;
    loadCampusPeriodAggregates(db).then(rows => {
      if (active) setAggregateRows(rows);
    }).catch(() => {
      if (active) setAggregateRows([]);
    });
    return () => { active = false; };
  }, [view, refresh]);
  useEffect(() => {
    if (view !== 'overview' && view !== 'staffing') return;
    let active = true;
    Promise.all([loadClusteringStatus(db), loadFacilitatorWorkload(db)]).then(([clustering, workload]) => {
      if (active) {
        setClusteringStatus(clustering);
        setWorkloadRows(workload);
      }
    }).catch(() => {
      if (active) {
        setClusteringStatus(null);
        setWorkloadRows([]);
      }
    });
    return () => { active = false; };
  }, [view, refresh]);
  const campusOptions = useMemo(() => {
    const options = new Map(ALL_CAMPUSES.map(key => [key, getCampusLabel(key)]));
    for (const campus of catalogue.campuses) options.set(campus.key, campusLabel(campus.key, campus.label));
    options.set('__unknown__', 'Unknown / Unassigned');
    return [...options].sort((a, b) => a[1].localeCompare(b[1]));
  }, [catalogue]);
  function selectPeriod(next: Period) {
    setPeriod(next); setValidationError(null);
    if (next === 'custom') { setCustomDates({ startDate: filters.startDate, endDate: filters.endDate }); return; }
    setFilters(current => ({ ...current, ...presetDates(next) }));
  }
  function applyCustomDates() {
    const start = Date.parse(`${customDates.startDate}T00:00:00+08:00`), end = Date.parse(`${customDates.endDate}T00:00:00+08:00`);
    const validDay = (time: number, value: string) => Number.isFinite(time) && isoDate(new Date(time + 8 * 3600000)) === value;
    if (!validDay(start, customDates.startDate) || !validDay(end, customDates.endDate) || end < start || end - start >= 366 * 86400000) {
      setValidationError('Choose valid dates in order, covering at most 366 days.'); return;
    }
    setValidationError(null); setFilters(current => ({ ...current, ...customDates }));
  }
  return <div className="space-y-5">
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-gray-900">{view === 'overview' ? 'Statistics Overview' : view === 'referrals' ? 'Referral Analytics' : view === 'forecast' ? 'Referral demand forecast' : view === 'staffing' ? 'Facilitator Staffing' : view === 'participation' ? 'Participation & engagement' : view === 'trends' ? 'Engagement trends' : 'Assessment scores'}</h2><p className="mt-1 text-sm text-gray-500">{descriptions[view]}</p></div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh this tab</Button>
      </div>
      <div className={`mt-5 grid gap-4 sm:grid-cols-2 ${view === 'trends' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <label className="text-sm font-medium text-gray-700">Campus
          <select className={control} value={filters.campus} onChange={event => setFilters(current => ({ ...current, campus: event.target.value }))}>
            <option value="">All campuses</option>{campusOptions.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select>
          {(view === 'referrals' || view === 'forecast' || view === 'staffing') && <span className="mt-1 block text-xs font-normal text-gray-500">Uses request-time campus. Missing campuses remain Unknown / Unassigned.</span>}
        </label>
        <label className="text-sm font-medium text-gray-700">{view === 'referrals' || view === 'forecast' || view === 'staffing' ? 'Request creation period' : view === 'scores' ? 'Submission period' : view === 'trends' ? 'Trend window' : view === 'overview' ? 'Reporting period' : 'Activity period'}
          <select className={control} value={period} onChange={event => selectPeriod(event.target.value as Period)}>
            <option value="month">This month</option><option value="week">This week</option><option value="previous">Previous month</option><option value="quarter">Last 3 calendar months (to date)</option><option value="year">Last 12 calendar months (to date)</option><option value="custom">Custom dates</option>
          </select>
        </label>
        {(view === 'overview' || view === 'trends' || view === 'referrals' || view === 'forecast' || view === 'staffing') && <>
          <label className="text-sm font-medium text-gray-700">Interval<select className={control} value={filters.interval} onChange={event => setFilters(current => ({ ...current, interval: event.target.value as StatisticsFilters['interval'] }))}><option value="daily">Daily</option><option value="weekly">Weekly (Monday to Sunday)</option><option value="monthly">Monthly</option></select></label>
          {(view === 'trends' || view === 'overview') && <label className="text-sm font-medium text-gray-700">Activity<select className={control} value={activity} onChange={event => setActivity(event.target.value as TrendActivity)}>{Object.entries(activityLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>}
        </>}
        {view === 'scores' && <label className="text-sm font-medium text-gray-700">Instrument<select className={control} value={instrument} onChange={event => setInstrument(event.target.value)}>{instruments.map(label => <option key={label}>{label}</option>)}</select></label>}
        {view === 'participation' && <label className="text-sm font-medium text-gray-700">Assessment<select className={control} value={filters.assessmentId} onChange={event => setFilters(current => ({ ...current, assessmentId: event.target.value }))}><option value="">All assessments</option>{catalogue.assessments.map(assessment => <option value={assessment.id} key={assessment.id}>{assessment.title}</option>)}</select><span className="mt-1 block text-xs font-normal text-gray-500">Changes assessment metrics only.</span></label>}
      </div>
      {view === 'scores' && <label className="mt-4 block max-w-sm text-sm font-medium text-gray-700">Assessment definition<select className={control} value={filters.assessmentId} onChange={event => setFilters(current => ({ ...current, assessmentId: event.target.value }))}><option value="">All assessments</option>{catalogue.assessments.map(assessment => <option value={assessment.id} key={assessment.id}>{assessment.title}</option>)}</select></label>}
      {view === 'trends' && <details className="mt-4 text-sm text-gray-600"><summary className="cursor-pointer text-xs font-medium">Assessment activity: {filters.assessmentId ? catalogue.assessments.find(assessment => assessment.id === filters.assessmentId)?.title ?? 'Selected assessment' : 'All assessments'}</summary><label className="mt-3 block max-w-sm text-sm">Assessment<select className={control} value={filters.assessmentId} onChange={event => setFilters(current => ({ ...current, assessmentId: event.target.value }))}><option value="">All assessments</option>{catalogue.assessments.map(assessment => <option value={assessment.id} key={assessment.id}>{assessment.title}</option>)}</select><span className="mt-1 block text-xs text-gray-500">Changes assessment activity only; appointments and messaging retain their counts.</span></label></details>}
      {period === 'custom' && <form className="mt-4 rounded-lg bg-gray-50 p-4" onSubmit={event => { event.preventDefault(); applyCustomDates(); }}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">From<input required type="date" className={control} value={customDates.startDate} onChange={event => setCustomDates(current => ({ ...current, startDate: event.target.value }))} /></label>
          <label className="text-sm text-gray-700">Through (inclusive)<input required type="date" className={control} value={customDates.endDate} onChange={event => setCustomDates(current => ({ ...current, endDate: event.target.value }))} /></label>
          <Button type="submit" size="sm" disabled={loading}>Apply dates to this tab</Button>
        </div>
        {validationError && <p role="alert" className="mt-3 text-sm text-red-700">{validationError}</p>}
        <p className="mt-2 text-xs text-gray-500">Dates are applied only after you select Apply. The report caption shows the current applied period.</p>
      </form>}
      <p className="mt-4 text-xs text-gray-500">Filters apply only to this tab.</p>
    </Card>
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}<p className="mt-1 text-xs">No report values are shown until a request succeeds.</p></div>}
    {loading && <div className="flex justify-center py-12" aria-live="polite"><Spinner label="Preparing this report..." /></div>}
    {report && <>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-500">
        <span>{report.filters.startDate} through {report.filters.endDate} · {report.filters.campus ? campusOptions.find(([key]) => key === report.filters.campus)?.[1] : 'All campuses'}</span>
        <span>Data fetched {new Date(report.sourceLoadedAt ?? report.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</span>
      </div>
      {view === 'referrals' && report.referrals.requests === 0 && <p className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">No referral requests recorded for this campus and period. Requests without a request-time campus are available under All campuses or Unknown / Unassigned.</p>}
      {(view === 'participation' || view === 'trends') && report.totals.participants === 0 && <p className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">No activity recorded for this campus and period.</p>}
      {view === 'overview' && <StatisticsOverviewView report={report} activity={activity} aggregateRows={aggregateRows} clusteringStatus={clusteringStatus} workloadRows={workloadRows} />}
      {view === 'referrals' && <ReferralsView report={report} />}
      {view === 'forecast' && <ReferralForecastView forecast={report.referrals.forecast} />}
      {view === 'staffing' && <FacilitatorStaffingView report={report} workloadRows={workloadRows} />}
      {view === 'participation' && <ParticipationView report={report} />}
      {view === 'trends' && <TrendsView report={report} activity={activity} />}
      {view === 'scores' && <div className="space-y-5"><GradedAssessmentScoresView report={report} /><ScoresView report={report} instrument={instrument} version={version} focusedCampus={focusedCampus} onVersionChange={setVersion} onCampusChange={setFocusedCampus} /></div>}
      <CoverageDetails report={report} view={view} />
    </>}
  </div>;
}
