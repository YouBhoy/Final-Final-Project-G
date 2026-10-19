import { AppProviders } from '../providers/AppProviders';
import { RootNavigator } from '../navigation/RootNavigator';
import { GardenBackendBoundary } from '../garden/GardenBackendBoundary';

export default function App() {
  return (
    <GardenBackendBoundary>
      <AppProviders>
        <RootNavigator />
      </AppProviders>
    </GardenBackendBoundary>
  );
}
