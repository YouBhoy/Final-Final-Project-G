import { useRef, useState, type KeyboardEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { StatisticsPanel } from '../../components/statistics/StatisticsPanel';
import type { StatisticsView } from '../../components/statistics/StatisticsViews';

const tabs: { key: StatisticsView; label: string; description: string }[] = [
  { key: 'referrals', label: 'Referral Analytics', description: 'Student requests to facilitators' },
  { key: 'participation', label: 'Participation', description: 'Students & campus engagement' },
  { key: 'trends', label: 'Trends', description: 'Activity over time' },
  { key: 'scores', label: 'Assessment Scores', description: 'Submitted score distributions' },
];

/** Cache each visited panel in memory; changing accounts discards every panel. */
function StatisticsWorkspace() {
  const [active, setActive] = useState<StatisticsView>('referrals');
  const [visited, setVisited] = useState<StatisticsView[]>(['referrals']);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function selectTab(view: StatisticsView) {
    setActive(view);
    setVisited(current => current.includes(view) ? current : [...current, view]);
  }
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[next].key);
    tabRefs.current[next]?.focus();
  }
  return <div className="space-y-6">
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Campus insights</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">Statistics</h1>
      <p className="mt-2 text-sm text-gray-500">Explore student-to-facilitator referral requests, with participation and assessment analytics as supporting views. Each tab remembers its own filters.</p>
    </div>
    <div role="tablist" aria-label="Statistics views" className="grid grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm lg:grid-cols-4">
      {tabs.map((tab, index) => <button
        type="button" role="tab" key={tab.key} id={`statistics-tab-${tab.key}`}
        aria-selected={active === tab.key} aria-controls={`statistics-panel-${tab.key}`}
        tabIndex={active === tab.key ? 0 : -1}
        ref={element => { tabRefs.current[index] = element; }}
        onClick={() => selectTab(tab.key)} onKeyDown={event => navigateTabs(event, index)}
        className={`rounded-lg px-2 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-red-300 sm:px-4 ${active === tab.key ? 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-100' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
      >
        <span className="block text-xs font-semibold sm:text-sm">{tab.label}</span>
        <span className="mt-1 hidden text-xs sm:block">{tab.description}</span>
      </button>)}
    </div>
    {tabs.map(tab => <div key={tab.key} role="tabpanel" id={`statistics-panel-${tab.key}`} aria-labelledby={`statistics-tab-${tab.key}`} hidden={active !== tab.key}>
      {visited.includes(tab.key) && <StatisticsPanel view={tab.key} />}
    </div>)}
  </div>;
}

export function AdminStatisticsPage() {
  const { user } = useAuth();
  if (user?.role !== 'super_admin') return <p role="alert" className="text-red-700">Statistics requires a super administrator account.</p>;
  return <StatisticsWorkspace key={user.uid} />;
}
