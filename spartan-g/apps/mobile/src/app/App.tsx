import { AppProviders } from '../providers/AppProviders';
import { RootNavigator } from '../navigation/RootNavigator';
import { GardenBackendBoundary } from '../garden/GardenBackendBoundary';
import { AppSecurityBoundary } from '../security/AppSecurityBoundary';
import { PrivateDocumentationGate } from '../security/ScreenCaptureBoundary';
import { PrivacyConsentGate } from '../security/PrivacyConsentGate';

export default function App() {
  return (
    <GardenBackendBoundary>
      <AppProviders>
        <AppSecurityBoundary><PrivacyConsentGate><PrivateDocumentationGate><RootNavigator /></PrivateDocumentationGate></PrivacyConsentGate></AppSecurityBoundary>
      </AppProviders>
    </GardenBackendBoundary>
  );
}
