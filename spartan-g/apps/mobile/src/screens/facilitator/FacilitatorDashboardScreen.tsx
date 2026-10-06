import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { lightColors } from '@spartan-g/shared-ui';
import {
  useAuthStore,
  riskAlertService,
  appointmentService,
} from '@spartan-g/shared-services';
import {
  hasPermission,
  PERMISSIONS,
  type RiskAlertDocument,
  type AppointmentDocument,
  type FacilitatorMobileTabParamList,
} from '@spartan-g/shared-types';

type Alert = RiskAlertDocument & { id: string };
type Appointment = AppointmentDocument & { id: string };

const SEVERITY_COLORS: Record<Alert['severity'], string> = {
  critical: '#B91C1C',
  high: '#EA580C',
  medium: '#D97706',
  low: '#16A34A',
};

export function FacilitatorDashboardScreen() {
  const session = useAuthStore((s) => s.session);
  const navigation = useNavigation<BottomTabNavigationProp<FacilitatorMobileTabParamList>>();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const canViewAlerts = !!session && hasPermission(session.role, PERMISSIONS.VIEW_RISK_ALERTS);
  const canManageAppointments =
    !!session && hasPermission(session.role, PERMISSIONS.MANAGE_APPOINTMENTS);

  const load = useCallback(async () => {
    if (!session?.uid) return;
    const tasks: Promise<unknown>[] = [];
    if (canViewAlerts) {
      tasks.push(
        riskAlertService
          .getOpenAlerts(session.uid, session.role)
          .then((list) => setAlerts(list as Alert[]))
          .catch(() => setAlerts([])),
      );
    }
    if (canManageAppointments) {
      tasks.push(
        appointmentService
          .getUpcoming(session.uid, session.role)
          .then((list) => setAppointments(list as Appointment[]))
          .catch(() => setAppointments([])),
      );
    }
    await Promise.all(tasks);
  }, [session?.uid, session?.role, canViewAlerts, canManageAppointments]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />}
    >
      <Text style={styles.title}>Facilitator Dashboard</Text>
      <Text style={styles.subtitle}>
        {session?.displayName ? `Welcome, ${session.displayName.split(' ')[0]}` : 'Loading…'}
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={lightColors.primary} size="large" />
      ) : (
        <>
          {canViewAlerts ? (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('RiskAlerts')}
            >
              <Text style={styles.cardTitle}>Open Risk Alerts</Text>
              <Text style={[styles.cardCount, alerts.length > 0 && { color: SEVERITY_COLORS.critical }]}>
                {alerts.length}
              </Text>
              <Text style={styles.cardHint}>
                {alerts.length === 0
                  ? 'No open alerts. Great job!'
                  : 'Tap to review and manage alerts'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {canManageAppointments ? (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('Appointments')}
            >
              <Text style={styles.cardTitle}>Upcoming Appointments</Text>
              <Text style={styles.cardCount}>{appointments.length}</Text>
              <Text style={styles.cardHint}>
                {appointments.length === 0
                  ? 'No upcoming appointments scheduled'
                  : 'Tap to view your schedule'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: lightColors.background,
  },
  title: { fontSize: 24, fontWeight: '700', color: lightColors.text },
  subtitle: { fontSize: 14, color: lightColors.textSecondary, marginBottom: 24 },
  loader: { marginTop: 40 },
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: lightColors.text, marginBottom: 8 },
  cardCount: { fontSize: 40, fontWeight: '700', color: lightColors.primary, marginBottom: 4 },
  cardHint: { fontSize: 13, color: lightColors.textSecondary },
});