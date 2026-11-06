export const PROJECT = 'spartan-g-assessment-staging' as const;
export const DATABASE = '(default)' as const;
export const SERVICE_ACCOUNT = 'spartan-g-staging-notify@spartan-g-assessment-staging.iam.gserviceaccount.com' as const;
/** Requires a separately reviewed source change, not an environment-variable flip. */
export const RELEASE_APPROVED = false;

/** Design values only; no Firebase handler is registered. */
export const LIMITS = Object.freeze({
  region: 'asia-southeast1', maxInstances: 1, minInstances: 0, concurrency: 1,
  memory: '256MiB', cpu: 1, timeoutSeconds: 60,
  workDeadlineMs: 20000, maxAudiencePages: 5, maxDuePage: 20, maxWorkPerTick: 2,
});

export function stagingProject(project: string, database: string) {
  if (project !== PROJECT || database !== DATABASE) throw Error('Firebase notification staging identity rejected');
}
