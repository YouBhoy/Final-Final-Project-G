export interface CampusPeriodObservation {
  campusKey: string;
  periodStartDate: string;
  locked: boolean;
  complete: boolean;
  denominated: boolean;
  features: readonly number[];
  dataPhase?: 'development' | 'real_pilot';
  cutoffApproved?: boolean;
}

export interface ClusteringGate {
  enabled: boolean;
  reason: string;
  usableRows: number;
  usableCampuses: number;
  minimumRows: number;
  minimumCampuses: number;
}

export function evaluateClusteringGate(
  observations: readonly CampusPeriodObservation[],
  minimumRows = 30,
  minimumCampuses = 4,
): ClusteringGate {
  const usable = observations.filter(row =>
    row.locked && row.complete && row.denominated && row.features.length > 0
    && row.features.every(Number.isFinite)
    && row.dataPhase === 'real_pilot'
    && row.cutoffApproved === true);
  const usableCampuses = new Set(usable.map(row => row.campusKey)).size;
  if (usableCampuses < minimumCampuses) {
    return { enabled: false, reason: 'Needs at least 4 usable campuses.', usableRows: usable.length,
      usableCampuses, minimumRows, minimumCampuses };
  }
  if (usable.length < minimumRows) {
    return { enabled: false, reason: 'Needs at least 30 usable campus-period observations.',
      usableRows: usable.length, usableCampuses, minimumRows, minimumCampuses };
  }
  return { enabled: true, reason: 'Operational clustering may run; stability and identity checks are still required.',
    usableRows: usable.length, usableCampuses, minimumRows, minimumCampuses };
}

export function leaveOneCampusOutStable(
  campusKeys: readonly string[],
  observations: readonly CampusPeriodObservation[],
): { stable: boolean; heldOutCampuses: number; reason: string } {
  if (!campusKeys.length || campusKeys.length < 4) {
    return { stable: false, heldOutCampuses: 0, reason: 'Leave-one-campus-out needs at least 4 campuses.' };
  }
  const available = new Set(observations.map(row => row.campusKey));
  const heldOutCampuses = campusKeys.filter(campus => available.has(campus)).length;
  if (heldOutCampuses !== campusKeys.length) {
    return { stable: false, heldOutCampuses, reason: 'Every campus must have usable rows in this stability check.' };
  }
  return { stable: true, heldOutCampuses, reason: 'All campuses have enough rows for leave-one-campus-out.' };
}
