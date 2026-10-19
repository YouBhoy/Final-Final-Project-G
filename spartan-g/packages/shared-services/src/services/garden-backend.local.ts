// Metro includes this bridge only in an explicitly opted-in Android development graph.
import { localEmulators } from '../config/local-emulators';
import { getLocalGardenOperations } from './local-garden-operations';
export const isGardenBackendEnabled = (): boolean => localEmulators.enabled;
export const getGardenOperations = getLocalGardenOperations;
