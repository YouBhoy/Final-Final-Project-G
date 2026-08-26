/**
 * SPARTAN-G campuses.
 *
 * `Campus` is a top-level user attribute, stored separately from `role`.
 * Both Students and Facilitators are assigned exactly one campus at
 * registration. Campus keys are stable identifiers; display labels and
 * locations are provided by `CAMPUS_LABELS` / `CAMPUS_LOCATIONS`.
 */

export const CAMPUSES = {
  PABLO_BORBON: 'pablo_borbon',
  ALANGILAN: 'alangilan',
  ARASOF_NASUGBU: 'arasof_nasugbu',
  JPLPC_MALVAR: 'jplpc_malvar',
  LIPA: 'lipa',
} as const;

export type Campus = (typeof CAMPUSES)[keyof typeof CAMPUSES];

/** All campuses in the canonical system order. */
export const ALL_CAMPUSES: readonly Campus[] = [
  CAMPUSES.PABLO_BORBON,
  CAMPUSES.ALANGILAN,
  CAMPUSES.ARASOF_NASUGBU,
  CAMPUSES.JPLPC_MALVAR,
  CAMPUSES.LIPA,
];

/** Full display names for each campus. */
export const CAMPUS_LABELS: Record<Campus, string> = {
  [CAMPUSES.PABLO_BORBON]: 'Pablo Borbon (Main I) – Batangas City',
  [CAMPUSES.ALANGILAN]: 'Alangilan (Main II) – Batangas City',
  [CAMPUSES.ARASOF_NASUGBU]: 'ARASOF-Nasugbu – Nasugbu',
  [CAMPUSES.JPLPC_MALVAR]: 'JPLPC-Malvar – Malvar',
  [CAMPUSES.LIPA]: 'Lipa Campus – Lipa City',
};

/** Short campus name (without the location suffix). */
export const CAMPUS_SHORT_LABELS: Record<Campus, string> = {
  [CAMPUSES.PABLO_BORBON]: 'Pablo Borbon',
  [CAMPUSES.ALANGILAN]: 'Alangilan',
  [CAMPUSES.ARASOF_NASUGBU]: 'ARASOF-Nasugbu',
  [CAMPUSES.JPLPC_MALVAR]: 'JPLPC-Malvar',
  [CAMPUSES.LIPA]: 'Lipa Campus',
};

/** Geographic location / city for each campus. */
export const CAMPUS_LOCATIONS: Record<Campus, string> = {
  [CAMPUSES.PABLO_BORBON]: 'Batangas City',
  [CAMPUSES.ALANGILAN]: 'Batangas City',
  [CAMPUSES.ARASOF_NASUGBU]: 'Nasugbu',
  [CAMPUSES.JPLPC_MALVAR]: 'Malvar',
  [CAMPUSES.LIPA]: 'Lipa City',
};

/** Returns the canonical display label, or the raw value if unknown. */
export function getCampusLabel(campus: Campus | null | undefined): string {
  if (!campus) return 'Not assigned';
  return CAMPUS_LABELS[campus] ?? campus;
}