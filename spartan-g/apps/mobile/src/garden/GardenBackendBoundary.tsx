import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { productionGardenEnabled } from '@spartan-g/shared-services/src/config/garden-backend';
import { installProductionGardenBackend } from './productionGardenBackend';
export function GardenBackendBoundary({ children }: { children: ReactNode }) {
  if (!productionGardenEnabled) return <>{children}</>;
  try { installProductionGardenBackend(); }
  catch { return <View><Text>Garden configuration unavailable. Restart with an approved application build.</Text></View>; }
  return <>{children}</>;
}
