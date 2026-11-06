/** No account data, token serialization, biometric calls or business writes. */
export function createInstallationSessionGuard(ports: {
  requiresFreshSignIn(): Promise<boolean>;
  signOutRestoredSession(): Promise<void>;
  markInstallationReady(): Promise<boolean>;
}) {
  let pending: Promise<void> | undefined;
  return () => pending ??= (async () => {
    const fresh = await ports.requiresFreshSignIn();
    if (typeof fresh !== 'boolean') throw new Error('Installation readiness is unknown.');
    if (!fresh) return;
    await ports.signOutRestoredSession();
    if (await ports.markInstallationReady() !== true) throw new Error('Installation readiness could not be saved.');
  })().catch(error => { pending = undefined; throw error; });
}
