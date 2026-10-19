import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Button, Text, View } from 'react-native';
import { useAuthStore } from '@spartan-g/shared-services';
import { getGardenOperations, isGardenBackendEnabled } from '@spartan-g/shared-services/src/services/garden-backend';
import { clientGardenRewardsAvailable, gardenUnavailableMessage } from '@spartan-g/shared-services/src/config/garden-capabilities';
const emptySubscribe = () => () => {};
const emptySnapshot = () => undefined;
export function GardenRewardStatus() {
  const uid = useAuthStore(state => state.session?.uid);
  const client = isGardenBackendEnabled() ? getGardenOperations() : undefined;
  const snapshot = useCallback(() => uid ? client?.getStatus(uid) : undefined, [client, uid]);
  const status = useSyncExternalStore(client?.subscribe ?? emptySubscribe, client ? snapshot : emptySnapshot);
  useEffect(() => {
    if (uid && client) client.hydrate(uid).catch(() => console.warn('[Garden] Pending requests unavailable; saved requests were not reset.'));
  }, [uid, client]);
  if (!client && uid && !clientGardenRewardsAvailable) {
    return <View accessibilityLiveRegion="polite"><Text>{gardenUnavailableMessage}</Text></View>;
  }
  if (!client || !uid || !status?.assessmentMessage) return null;
  return <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
    <Text>{status.assessmentMessage}</Text>
    {status.pendingAssessmentCount > 0 && <Button title="Retry Garden rewards" onPress={() => {
      client.retryAssessments(uid).catch(() => console.warn('[Garden] Reward confirmation remains unavailable.'));
    }} />}
  </View>;
}
