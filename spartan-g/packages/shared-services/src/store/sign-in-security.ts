/** Platform-neutral hook; the Android application installs its local guard.
 * No native imports, credentials, tokens or biometric data cross this port. */
let prepare: (() => Promise<void>) | null = null;
let initialize: (() => Promise<void>) | null = null;
export function installAuthInitializationGuard(handler: () => Promise<void>) {
  initialize = handler;
  return () => { if (initialize === handler) initialize = null; };
}
export async function prepareAuthInitialization() { if (initialize) await initialize(); }
export function installPasswordSignInGuard(handler: () => Promise<void>) {
  prepare = handler;
  return () => { if (prepare === handler) prepare = null; };
}
export async function preparePasswordSignIn() { await prepareAuthInitialization(); if (prepare) await prepare(); }
