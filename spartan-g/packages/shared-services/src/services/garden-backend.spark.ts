import type { GardenOperationsClient } from './garden-operations.client';

// Build-selected Spark adapter. Environment flags cannot activate absent backend services.
export const isGardenBackendEnabled = (): boolean => false;
export function installGardenOperations(_value: GardenOperationsClient): never {
  throw new Error('Garden reward services are unavailable in this Spark build.');
}
export function getGardenOperations(): GardenOperationsClient {
  throw new Error('Garden reward services are unavailable in this Spark build.');
}
