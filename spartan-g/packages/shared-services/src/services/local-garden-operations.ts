import { localEmulators } from '../config/local-emulators';
import type { GardenOperationsClient } from './garden-operations.client';
let client: GardenOperationsClient | undefined;
export function installLocalGardenOperations(value: GardenOperationsClient): void {
  if (!localEmulators.enabled) throw new Error('Garden backend integration is local-development only.');
  if (client && client !== value) throw new Error('Local Garden backend already initialized; cold restart required.');
  client = value;
}
export function getLocalGardenOperations(): GardenOperationsClient {
  if (!localEmulators.enabled || !client) throw new Error('The isolated Garden backend is not ready.');
  return client;
}
