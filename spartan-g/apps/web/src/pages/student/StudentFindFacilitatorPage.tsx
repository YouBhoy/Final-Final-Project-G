import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { userService, workHoursService, profileRepository } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { useCampuses } from '../../hooks/useCampuses';
import {
  CAMPUS_LABELS,
  Gender,
} from '@spartan-g/shared-types';
import type { Campus } from '@spartan-g/shared-types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const GENDER_LABELS: Record<Gender, string> = {
  male: 'He/Him',
  female: 'She/Her',
  non_binary: 'They/Them',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};


const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const MailIcon = ({ size = 18 }: { size?: number }) => (
  <svg {...iconProps} width={size} height={size}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
const PinIcon = ({ size = 18 }: { size?: number }) => (
  <svg {...iconProps} width={size} height={size}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
);
const CalendarIcon = ({ size = 18 }: { size?: number }) => (
  <svg {...iconProps} width={size} height={size}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
);
const ChevronDownIcon = ({ open }: { open: boolean }) => (
  <svg {...iconProps} width={16} height={16} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const SearchIcon = () => (
  <svg {...iconProps}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
const ArrowRightIcon = () => (
  <svg {...iconProps}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
);

interface FacilitatorWithProfile {
  id: string;
  displayName: string;
  email: string;
  campus?: Campus;
  photoURL?: string;
  pronouns?: string;
  gender?: Gender;
  bio?: string;
  institution?: string;
}

export function StudentFindFacilitatorPage() {
  const [selectedFacilitator, setSelectedFacilitator] = useState<string | null>(null);
  const [facilitators, setFacilitators] = useState<FacilitatorWithProfile[]>([]);
  const [workHoursMap, setWorkHoursMap] = useState<{ [key: string]: any[] }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [campusFilter, setCampusFilter] = useState<Campus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, status } = useAuth();
  const { campuses } = useCampuses();

  const campusLabel = (key?: string) =>
    key ? campuses.find((c) => c.key === key)?.label ?? (CAMPUS_LABELS as Record<string, string>)[key] ?? key : '';

  // Facilitators visible under the current campus filter and name search. The
  // student's own campus is surfaced first when "all campuses" is selected.
  const visibleFacilitators = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const byCampus =
      campusFilter === 'all'
        ? facilitators
        : facilitators.filter((f) => f.campus === campusFilter);
    const filtered = query
      ? byCampus.filter((f) => f.displayName.toLowerCase().includes(query))
      : byCampus;

    const myCampus = user?.campus;
    if (campusFilter === 'all' && myCampus) {
      return [...filtered].sort((a, b) => {
        const aMine = a.campus === myCampus ? 0 : 1;
        const bMine = b.campus === myCampus ? 0 : 1;
        if (aMine !== bMine) return aMine - bMine;
        return a.displayName.localeCompare(b.displayName);
      });
    }
    return filtered;
  }, [facilitators, campusFilter, searchQuery, user?.campus]);

  useEffect(() => {
    if (!user || status !== 'authenticated') { setIsLoading(false); return; }
    let cancelled = false;
    const loadFacilitators = async () => {
      try {
        setError(null); setFacilitators([]); setWorkHoursMap({});
        const users = await userService.listUsersByRole('facilitator', user.role);
        if (cancelled) return;
        
        // Fetch profiles for each facilitator
        const facilitatorIds = users.map((u: any) => u.id);
        const profiles = await Promise.all(
          facilitatorIds.map(async (id: string) => {
            try {
              return await profileRepository.getById(id);
            } catch {
              return null;
            }
          })
        );
        
        const mapped = users.map((u: any, index: number) => ({
          id: u.id,
          displayName: u.displayName || 'Facilitator',
          email: u.email || '',
          campus: u.campus as Campus | undefined,
          photoURL: u.photoURL,
          pronouns: profiles[index]?.pronouns,
          gender: profiles[index]?.gender,
          bio: profiles[index]?.bio,
          institution: profiles[index]?.institution,
        }));
        
        setFacilitators(mapped);
        const whMap: { [key: string]: any[] } = {};
        await Promise.allSettled(
          mapped.map(async (fac) => {
            try { const schedule = await workHoursService.getActiveSchedule(fac.id, user.role); whMap[fac.id] = schedule; }
            catch { whMap[fac.id] = []; }
          }),
        );
        if (!cancelled) setWorkHoursMap(whMap);
      } catch (err) {
        if (!cancelled) { const msg = err instanceof Error ? err.message : 'Failed to load facilitators.'; setError(msg); console.error('[StudentFindFacilitatorPage] load error:', err); }
      } finally { if (!cancelled) setIsLoading(false); }
    };
    loadFacilitators();
    return () => { cancelled = true; };
  }, [user?.role, status]);

  if (status === 'idle' || status === 'loading' || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading facilitators...</p>
        </div>
      </div>
    );
  }

  const trimmedQuery = searchQuery.trim();
  const count = visibleFacilitators.length;
  const countText = `${count} facilitator${count === 1 ? '' : 's'}`;
  const resultsSummary = trimmedQuery
    ? `${countText} found for "${trimmedQuery}"${campusFilter !== 'all' ? ` at ${campusLabel(campusFilter)}` : ''}`
    : campusFilter !== 'all'
      ? `${countText} at ${campusLabel(campusFilter)}`
      : `${countText} available`;

  // The expanded card gets a little more of the row; its neighbour keeps its natural height.
  const expandedIndex = visibleFacilitators.findIndex((f) => f.id === selectedFacilitator);
  const gridCols =
    expandedIndex < 0
      ? 'md:grid-cols-2'
      : expandedIndex % 2 === 0
        ? 'md:grid-cols-[1.35fr_1fr]'
        : 'md:grid-cols-[1fr_1.35fr]';

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <h1 className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">Find a Facilitator</h1>
      <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
        Browse facilitators across all campuses or filter to a specific campus.
        {user?.campus && (
          <> Your campus: <span className="font-medium text-[var(--color-primary)]">{campusLabel(user.campus)}</span>.</>
        )}
      </p>

      {/* Search */}
      <div className="relative mb-4">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-text-muted)]">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by facilitator name..."
          aria-label="Search facilitators by name"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--color-text)] outline-none transition-shadow placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
        />
      </div>

      {/* Campus selection */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{ key: 'all', label: 'All Campuses', location: 'View everyone' }, ...campuses].map((c) => {
          const active = campusFilter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              onClick={() => setCampusFilter(c.key as Campus | 'all')}
              className={`flex h-full flex-col justify-center rounded-[var(--radius-md)] px-4 py-3 text-left transition-colors ${
                active
                  ? 'bg-[var(--color-primary)] text-white shadow-sm'
                  : 'bg-[var(--color-bg-alt)] text-[var(--color-text)] hover:bg-[var(--color-primary-pastel)]'
              }`}
            >
              <span className="break-words text-sm font-semibold leading-snug">{c.label}</span>
              <span className={`mt-1 text-xs ${active ? 'text-white/80' : 'text-[var(--color-text-muted)]'}`}>
                {c.location}
              </span>
            </button>
          );
        })}
      </div>

      {facilitators.length > 0 && (
        <p className="mb-4 text-sm font-medium text-[var(--color-text-secondary)]" aria-live="polite">
          {resultsSummary}
          <span className="font-normal text-[var(--color-text-muted)]"> · Select a facilitator to view their available hours.</span>
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-error-bg)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      {visibleFacilitators.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center shadow-card">
          <h3 className="mb-1 text-base font-semibold text-[var(--color-text)]">No facilitators found</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {facilitators.length === 0
              ? 'No facilitators are currently available.'
              : trimmedQuery
                ? `No facilitators match "${trimmedQuery}"${campusFilter !== 'all' ? ` at ${campusLabel(campusFilter)}` : ''}.`
                : `There are currently no facilitators available at ${campusLabel(campusFilter)}.`}
          </p>
          {facilitators.length > 0 && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setCampusFilter('all'); }}
              className="mt-5 inline-flex rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[var(--color-primary-light)]"
            >
              {trimmedQuery ? (campusFilter !== 'all' ? 'Clear filters' : 'Clear search') : 'View All Campuses'}
            </button>
          )}
        </div>
      ) : (
        <div className={`grid items-start gap-4 transition-[grid-template-columns] duration-300 ease-out ${gridCols}`}>
          {visibleFacilitators.map((fac) => {
            const schedule = (workHoursMap[fac.id] || []).filter((s) => s.isActive);
            const hoursLoading = workHoursMap[fac.id] === undefined;
            const canBook = !hoursLoading && schedule.length > 0;
            const initial = (fac.displayName || 'F').charAt(0).toUpperCase();
            const isOpen = selectedFacilitator === fac.id;
            const toggle = () => setSelectedFacilitator((prev) => (prev === fac.id ? null : fac.id));

            return (
              <article
                key={fac.id}
                className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-card transition-all duration-200 hover:shadow-card-hover"
              >
                {/* Header (click to expand) */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={toggle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle();
                    }
                  }}
                  className={`flex cursor-pointer items-start gap-3 p-4 transition-colors duration-150 hover:bg-[var(--color-primary)]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] ${
                    isOpen ? 'border-b border-[var(--color-border)]' : 'border-b border-transparent'
                  }`}
                >
                  {fac.photoURL ? (
                    <img src={fac.photoURL} alt={fac.displayName} className="h-12 w-12 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
                      <span className="text-lg font-bold text-[var(--color-primary)]">{initial}</span>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold text-[var(--color-text)]" title={fac.displayName}>
                      {fac.displayName}
                    </h3>
                    {fac.email && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
                        <MailIcon size={14} />
                        <span className="truncate">{fac.email}</span>
                      </p>
                    )}
                    {fac.campus && (
                      <p className="mt-0.5 flex flex-wrap items-start gap-x-1.5 text-xs text-[var(--color-text-secondary)]">
                        <span className="mt-px shrink-0"><PinIcon size={14} /></span>
                        <span className="break-words">{campusLabel(fac.campus)}</span>
                        {user?.campus && fac.campus === user.campus && (
                          <>
                            <span aria-hidden="true" className="text-[var(--color-text-muted)]">·</span>
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                                stroke="currentColor"
                                aria-hidden="true"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                              My Campus
                            </span>
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                        Facilitator
                      </span>
                      <span className="text-[var(--color-text-muted)]">
                        <ChevronDownIcon open={isOpen} />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Body: animates open/closed; hidden content is removed from tab order */}
                <div
                  aria-hidden={!isOpen}
                  className={`grid transition-[grid-template-rows,visibility] duration-300 ease-out ${
                    isOpen ? 'visible grid-rows-[1fr]' : 'invisible grid-rows-[0fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                <div className="space-y-4 p-4">
                      {/* About */}
                      {(fac.pronouns || fac.gender || fac.institution || fac.bio) && (
                        <div className="space-y-1">
                          {(fac.pronouns || fac.gender || fac.institution) && (
                            <p className="text-xs text-[var(--color-text-secondary)]">
                              {[fac.pronouns, fac.gender ? GENDER_LABELS[fac.gender] : null, fac.institution]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                          {fac.bio && (
                            <p className="line-clamp-3 text-sm text-[var(--color-text-secondary)]">{fac.bio}</p>
                          )}
                        </div>
                      )}
  
                      {/* Available hours */}
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                            <CalendarIcon size={14} />
                          </span>
                          <h4 className="text-sm font-bold text-[var(--color-text)]">Available Hours</h4>
                        </div>
  
                        {hoursLoading ? (
                          <p className="text-sm text-[var(--color-text-secondary)]">Loading availability...</p>
                        ) : schedule.length === 0 ? (
                          <p className="text-sm italic text-[var(--color-text-secondary)]">No availability currently listed.</p>
                        ) : (
                          <ul>
                            {schedule.map((s) => (
                              <li
                                key={s.id}
                                className="flex justify-between border-b border-[var(--color-border)] py-1.5 text-sm text-[var(--color-text-secondary)] last:border-b-0"
                              >
                                <span>{DAYS[s.dayOfWeek] ?? 'Unknown'}</span>
                                <span className="tabular-nums">{s.startTime} - {s.endTime}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
  
                      {/* Booking (separate from the expand/collapse header) */}
                      {canBook ? (
                        <Link
                          to={`/student/facilitator/${encodeURIComponent(fac.id)}`}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[var(--color-primary-light)]"
                        >
                          <CalendarIcon size={16} />
                          Book Appointment
                          <ArrowRightIcon />
                        </Link>
                      ) : (
                        <div
                          aria-disabled="true"
                          className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-alt)] px-4 py-2 text-sm font-semibold text-[var(--color-text-muted)]"
                        >
                          {hoursLoading ? 'Checking availability...' : 'Currently unavailable'}
                        </div>
                      )}
                    </div>
  
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
