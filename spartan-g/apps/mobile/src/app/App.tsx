import { AppProviders } from '../providers/AppProviders';
import { RootNavigator } from '../navigation/RootNavigator';
import { GardenBackendBoundary } from '../garden/GardenBackendBoundary';
import { AppSecurityBoundary } from '../security/AppSecurityBoundary';
import { PrivacyConsentGate } from '../security/PrivacyConsentGate';

export default function App() {
  return (
    <GardenBackendBoundary>
      <AppProviders>
        <AppSecurityBoundary><PrivacyConsentGate><RootNavigator /></PrivacyConsentGate></AppSecurityBoundary>
      </AppProviders>
    </GardenBackendBoundary>
  );
}
