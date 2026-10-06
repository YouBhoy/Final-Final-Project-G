import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { lightColors } from '@spartan-g/shared-ui';
import { useAuthStore, riskAlertService } from '@spartan-g/shared-services';
import {
  RiskAlertDocument,
  hasPermission,
  PERMISSIONS,
  FacilitatorMobileTabParamList,
  FacilitatorMobileStackParamList,
} from '@spartan-g/shared-types';

type Alert = RiskAlertDocument & { id: string };

type RiskAlertsNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<FacilitatorMobileTabParamList, 'RiskAlerts'>,
  NativeStackNavigationProp<FacilitatorMobileStackParamList>
>;

const SEVERITY_COLORS: Record<Alert['severity'], string> = {
  critical: '#B91C1C',
  high: '#EA580C',
  medium: '#D97706',
  low: '#16A34A',
};

export function RiskAlertsScreen() {
  const session = useAuthStore((s) => s.session);
  const navigation = useNavigation<RiskAlertsNavigation>();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canView = !!session && hasPermission(session.role, PERMISSIONS.VIEW_RISK_ALERTS);

  const load = useCallback(async () => {
    if (!session?.uid || !canView) return;
    try {
      const list = await riskAlertService.getOpenAlerts(session.uid, session.role);
      setAlerts(list as Alert[]);
      setError(null);
    } catch {
      setError('Could not load risk alerts.');
    }
  }, [session?.uid, session?.role, canView]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!canView) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>You do not have access to risk alerts.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={alerts}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Open Risk Alerts</Text>
          {loading ? (
            <ActivityIndicator color={lightColors.primary} size="small" style={styles.smallLoader} />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? null : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <Text style={styles.empty}>No open risk alerts. Great job!</Text>
        )
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('RiskAlertDetail', { alertId: item.id })}
        >
          <View style={[styles.severityDot, { backgroundColor: SEVERITY_COLORS[item.severity] }]} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDesc} numberOfLines={2}>
              {item.description}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.severityLabel}>{item.severity.toUpperCase()}</Text>
              {item.overallRiskScore != null ? (
                <Text style={styles.score}>Risk {item.overallRiskScore}/100</Text>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: lightColors.background },
  listContent: { paddingHorizontal: 20, paddingVertical: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: lightColors.text },
  smallLoader: { marginRight: 4 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.background,
    padding: 24,
  },
  error: { color: lightColors.error, textAlign: 'center', marginTop: 24 },
  empty: { color: lightColors.textSecondary, textAlign: 'center', marginTop: 24 },
  card: {
    flexDirection: 'row',
    backgroundColor: lightColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: 16,
    marginBottom: 12,
  },
  severityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: lightColors.text, marginBottom: 4 },
  cardDesc: { fontSize: 13, color: lightColors.textSecondary, marginBottom: 8 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  severityLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: lightColors.primary,
  },
  score: {
    fontSize: 12,
    color: lightColors.textSecondary,
  },
});