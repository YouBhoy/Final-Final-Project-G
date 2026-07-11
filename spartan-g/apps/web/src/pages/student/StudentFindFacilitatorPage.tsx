import { useEffect, useState, useCallback } from 'react';
import { userService, workHoursService, profileRepository } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { Gender } from '@spartan-g/shared-types';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, status } = useAuth();

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
      <h1 className="mb-6 font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">Find a Facilitator</h1>

      {error && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-error-bg)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </div>
      )}

      {facilitators.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-[var(--color-text-secondary)] shadow-card">
          No facilitators are currently available.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {facilitators.map((fac) => {
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
                    <h3 className="font-semibold text-gray-900 truncate">{fac.displayName}</h3>
                    <p className="text-sm text-gray-500 truncate">{fac.email}</p>
                  </div>
                </div>

                {selectedFacilitator === fac.id && (
                  <div className="mt-3 border-t pt-3 space-y-3">
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