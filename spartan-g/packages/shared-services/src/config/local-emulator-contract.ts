export const LOCAL_GARDEN_PROJECT = 'demo-spartan-g-garden-phase2';
export const LOCAL_GARDEN_RULES_SHA256 = '4ec0f3c9bb399b9489c1d6ebf18f176ec81b9de3fbd20c3dee4fc5f370b7a5b1';

export type LocalEmulatorConfig = { readonly enabled: false } | {
  readonly enabled: true;
  readonly projectId: typeof LOCAL_GARDEN_PROJECT;
  readonly appName: 'spartan-local-garden';
  readonly host: '10.0.2.2';
  readonly authPort: 19099;
  readonly firestorePort: 18089;
  readonly functionsPort: 15001;
  readonly healthPort: 19098;
};

export function buildLocalEmulatorConfig(optIn: string | undefined, devBuild: boolean): LocalEmulatorConfig {
  if (optIn === undefined || optIn === '' || optIn === '0') return { enabled: false };
  if (optIn !== '1' || !devBuild) throw new Error('Local Firebase requires explicit opt-in and a development build.');
  return Object.freeze({ enabled: true, projectId: LOCAL_GARDEN_PROJECT, appName: 'spartan-local-garden',
    host: '10.0.2.2', authPort: 19099, firestorePort: 18089, functionsPort: 15001, healthPort: 19098 });
}

export function assertLocalUrl(url: string): void {
  if (!/^(?:https?|wss?):\/\/10\.0\.2\.2:(?:8083|15001|19099|18089|19098)(?:\/|$)/.test(url)) {
    throw new Error('LOCAL_FIREBASE_BLOCKED_NONLOCAL_REQUEST');
  }
}

export function validateLocalHealth(value: unknown): void {
  const health = value as Record<string, unknown> | null;
  if (!health || health.ready !== true || health.projectId !== LOCAL_GARDEN_PROJECT
      || health.rulesSha256 !== LOCAL_GARDEN_RULES_SHA256 || health.authPort !== 19099
      || health.firestorePort !== 18089 || health.functionsPort !== 15001 || health.region !== 'us-central1'
      || health.deviceIsolation !== true) {
    throw new Error('Local Auth, Firestore, Functions, candidate rules and device isolation must all be ready.');
  }
}
