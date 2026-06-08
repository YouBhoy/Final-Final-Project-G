import { AppProviders } from './providers/AppProviders';
import { RootNavigator } from '@/navigation';

export default function App() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
