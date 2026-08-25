import { useEffect, useState, useCallback, useMemo } from 'react';
import { userService, workHoursService, profileRepository } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import {
  ALL_CAMPUSES,
  CAMPUS_LABELS,
  CAMPUS_SHORT_LABELS,
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
  const [facilitators, setFacilitators] = useState<FacilitatorWithProfile[]>([]);
  const [workHoursMap, setWorkHoursMap] = useState<{ [key: string]: any[] }>({});
  const [selectedFacilitator, setSelectedFacilitator] = useState<string | null>(null);
  const [campusFilter, setCampusFilter] = useState<Campus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, status } = useAuth();

  // Facilitators visible under the current campus filter. The student's own
  // campus is surfaced first when "all campuses" is selected.
  const visibleFacilitators = useMemo(() => {
    const filtered =
      campusFilter === 'all'
        ? facilitators
        : facilitators.filter((f) => f.campus === campusFilter);

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
  }, [facilitators, campusFilter, user?.campus]);

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

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-2 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">Find a Facilitator</h1>
      <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
        Browse facilitators across all campuses or filter to a specific campus.
        {user?.campus && (
          <> Your campus: <span className="font-medium text-[var(--color-primary)]">{CAMPUS_LABELS[user.campus]}</span>.</>
        )}
      </p>

      {/* Campus filter */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-[var(--color-text)]">Campus:</span>
        <button
          type="button"
          onClick={() => setCampusFilter('all')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            campusFilter === 'all'
              ? 'bg-[var(--color-primary)] text-white shadow-sm'
              : 'bg-[var(--color-bg-alt)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-pastel)] hover:text-[var(--color-primary)]'
          }`}
        >
          All Campuses
        </button>
        {ALL_CAMPUSES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCampusFilter(c)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              campusFilter === c
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'bg-[var(--color-bg-alt)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-pastel)] hover:text-[var(--color-primary)]'
            }`}
          >
            {CAMPUS_SHORT_LABELS[c]}
            {user?.campus === c && ' ★'}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-error-bg)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      {visibleFacilitators.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-[var(--color-text-secondary)] shadow-card">
          {facilitators.length === 0
            ? 'No facilitators are currently available.'
            : `No facilitators found for ${campusFilter === 'all' ? 'this filter' : CAMPUS_LABELS[campusFilter]}.`}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleFacilitators.map((fac) => {
            const schedule = workHoursMap[fac.id] || [];
            const activeDays = schedule.filter((s) => s.isActive).map((s) => DAYS[s.dayOfWeek] ?? 'Unknown');
            const initial = (fac.displayName || 'F').charAt(0).toUpperCase();

            return (
              <div
                key={fac.id}
                className="cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-card transition-all duration-200 hover:shadow-card-hover"
                onClick={() => setSelectedFacilitator((prev) => (prev === fac.id ? null : fac.id))}
              >
                <div className="flex items-start gap-3">
                  {fac.photoURL ? (
                    <img src={fac.photoURL} alt={fac.displayName} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
                      <span className="text-lg font-semibold text-[var(--color-primary)]">{initial}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{fac.displayName}</h3>
                      {fac.campus && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--color-accent-pastel)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent-dark)]">
                          {CAMPUS_SHORT_LABELS[fac.campus]}
                        </span>
                      )}
                      {user?.campus && fac.campus === user.campus && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
                          My Campus
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{fac.email}</p>
                    {fac.campus && (
                      <p className="mt-0.5 text-xs text-gray-400">{CAMPUS_LABELS[fac.campus]}</p>
                    )}
                  </div>
                </div>

                {selectedFacilitator === fac.id && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    {/* Campus */}
                    {fac.campus && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Campus:</span> {CAMPUS_LABELS[fac.campus]}
                      </p>
                    )}

                    {/* Pronouns and Gender */}
                    {fac.pronouns && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Pronouns:</span> {fac.pronouns}
                      </p>
                    )}
                    {fac.gender && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Gender:</span> {GENDER_LABELS[fac.gender]}
                      </p>
                    )}

                    {/* Bio */}
                    {fac.bio && (
                      <p className="text-sm text-gray-600 line-clamp-3">{fac.bio}</p>
                    )}

                    {/* Institution */}
                    {fac.institution && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Institution:</span> {fac.institution}
                      </p>
                    )}

                    {/* Available Hours */}
                    <div className="mt-2">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Available Hours</h4>
                      {activeDays.length === 0 ? (
                        <p className="text-sm italic text-gray-400">No availability set</p>
                      ) : (
                        <div className="space-y-1">
                          {schedule.filter((s) => s.isActive).map((s) => (
                            <div key={s.id} className="flex justify-between text-sm">
                              <span className="text-gray-600">{DAYS[s.dayOfWeek] ?? 'Unknown'}</span>
                              <span className="text-gray-800">{s.startTime} - {s.endTime}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <a
                      href={`/student/facilitator/${encodeURIComponent(fac.id)}`}
                      className="mt-3 block w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-[var(--color-primary-light)]"
                    >
                      Book Appointment
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}