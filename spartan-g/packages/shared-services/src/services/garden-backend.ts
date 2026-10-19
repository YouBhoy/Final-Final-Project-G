import { productionGardenEnabled } from '../config/garden-backend';
import type { GardenOperationsClient } from './garden-operations.client';
let client: GardenOperationsClient | undefined;
export const isGardenBackendEnabled = (): boolean => productionGardenEnabled;
export function installGardenOperations(value: GardenOperationsClient): void {
  if (!productionGardenEnabled) throw new Error('Trusted Garden routing is not enabled in this build.');
  if (client && client !== value) throw new Error('Garden backend already initialized; cold restart required.');
  client = value;
}
export function getGardenOperations(): GardenOperationsClient {
  if (!productionGardenEnabled || !client) throw new Error('Trusted Garden backend is not ready.');
  return client;
}
