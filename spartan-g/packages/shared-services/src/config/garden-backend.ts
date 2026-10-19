export const GARDEN_PRODUCTION_PROJECT = 'spartan-g-a2d80';
// Matches the production-only backend; notification and local regions stay unchanged.
export const GARDEN_PRODUCTION_REGION = 'asia-southeast1';
export function trustedGardenOptIn(value: string | undefined): boolean {
  if (value === undefined || value === '' || value === '0') return false;
  if (value !== '1') throw new Error('Garden backend requires an explicit supported release setting.');
  return true;
}
// Prepared routing only. No .env/EAS setting is changed by this implementation.
export const productionGardenEnabled = trustedGardenOptIn(process.env.EXPO_PUBLIC_SPARTAN_GARDEN_BACKEND);
