import { useCallback, useEffect, useState } from 'react';
import { campusRepository } from '@spartan-g/shared-services';
import {
  ALL_CAMPUSES,
  CAMPUS_LABELS,
  CAMPUS_LOCATIONS,
  type Campus,
} from '@spartan-g/shared-types';

export interface CampusOption {
  key: Campus;
  label: string;
  location: string;
  isActive: boolean;
  sortOrder: number;
  persisted: boolean;
}

const DEFAULT_CAMPUSES: CampusOption[] = ALL_CAMPUSES.map((key, index) => ({
  key,
  label: CAMPUS_LABELS[key],
  location: CAMPUS_LOCATIONS[key],
  isActive: true,
  sortOrder: index,
  persisted: false,
}));

function mergeWithDefaults(
  persisted: Awaited<ReturnType<typeof campusRepository.getActiveCampuses>>,
): CampusOption[] {
  const byKey = new Map(persisted.map((campus) => [campus.key, campus]));
  const defaults = DEFAULT_CAMPUSES.map((fallback) => {
    const campus = byKey.get(fallback.key);
    return campus
      ? {
          key: campus.key,
          label: campus.label,
          location: campus.location,
          isActive: campus.isActive,
          sortOrder: campus.sortOrder,
          persisted: true,
        }
      : fallback;
  });
  const custom = persisted
    .filter((campus) => !ALL_CAMPUSES.includes(campus.key as (typeof ALL_CAMPUSES)[number]))
    .map((campus) => ({
      key: campus.key,
      label: campus.label,
      location: campus.location,
      isActive: campus.isActive,
      sortOrder: campus.sortOrder,
      persisted: true,
    }));
  return [...defaults, ...custom].sort(
    (a, b) => a.label.localeCompare(b.label),
  );
}

export function useCampuses() {
  const [campuses, setCampuses] = useState<CampusOption[]>(DEFAULT_CAMPUSES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const persisted = await campusRepository.getActiveCampuses();
      setCampuses(mergeWithDefaults(persisted));
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
      setCampuses(DEFAULT_CAMPUSES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { campuses, loading, error, reload };
}
