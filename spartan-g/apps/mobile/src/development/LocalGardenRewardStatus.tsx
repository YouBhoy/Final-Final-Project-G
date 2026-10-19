import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { Button, Text, View } from 'react-native';
import { useAuthStore } from '@spartan-g/shared-services';
import { localEmulators } from '@spartan-g/shared-services/src/config/local-emulators';
import { getLocalGardenOperations } from '@spartan-g/shared-services/src/services/local-garden-operations';
const emptySubscribe = () => () => {};
const emptySnapshot = () => undefined;

/** Local-only acknowledgment and explicit retry. Never scans historical attempts. */
export function LocalGardenRewardStatus() {
  const uid = useAuthStore(state => state.session?.uid);
  const client = localEmulators.enabled ? getLocalGardenOperations() : undefined;
  const snapshot = useCallback(() => uid ? client?.getStatus(uid) : undefined, [client, uid]);
  const status = useSyncExternalStore(client?.subscribe ?? emptySubscribe, client ? snapshot : emptySnapshot);
  useEffect(() => {
    if (uid && client) client.hydrate(uid).catch(() => console.warn('[LocalGarden] Pending request storage unavailable; requests were not reset.'));
  }, [uid, client]);
  if (!client || !uid || !status || !status.assessmentMessage) return null;
  return <View accessibilityLiveRegion="polite" style={{ gap: 6 }}>
    <Text>{status.assessmentMessage}</Text>
    {status.pendingAssessmentCount > 0 && <Button title="Retry Garden rewards" onPress={() => {
      client.retryAssessments(uid).catch(() => console.warn('[LocalGarden] Reward confirmation remains unavailable.'));
    }} />}
  </View>;
}
