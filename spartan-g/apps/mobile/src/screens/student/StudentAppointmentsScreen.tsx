import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, appointmentService, userService } from '@spartan-g/shared-services';
import type { AppointmentDocument } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';

const STATUS_ORDER = ['requested', 'accepted', 'completed', 'cancelled', 'rejected', 'no_show'];

function formatDateTime(timestamp: any): string {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'requested': return lightColors.warningText;
    case 'accepted': return lightColors.infoBadgeText;
    case 'completed': return lightColors.successText;
    case 'cancelled':
    case 'rejected':
    case 'no_show': return lightColors.errorText;
    default: return lightColors.textSecondary;
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'requested': return lightColors.warningBackground;
    case 'accepted': return lightColors.infoBackground;
    case 'completed': return lightColors.successBackground;
    case 'cancelled':
    case 'rejected':
    case 'no_show': return lightColors.errorBackground;
    default: return lightColors.neutralBackground;
  }
}

export function StudentAppointmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const session = useAuthStore((s) => s.session);

  const [appointments, setAppointments] = useState<(AppointmentDocument & { id: string })[]>([]);
  const [facilitatorNames, setFacilitatorNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    if (!session) return;
    try {
      const data = await appointmentService.getStudentAppointments(session.uid, session.role);
      data.sort((a, b) => {
        const aIdx = STATUS_ORDER.indexOf(a.status);
        const bIdx = STATUS_ORDER.indexOf(b.status);
        if (aIdx !== bIdx) return aIdx - bIdx;
        const aTime = a.scheduledAt?.toDate?.()?.getTime() || 0;
        const bTime = b.scheduledAt?.toDate?.()?.getTime() || 0;
        return bTime - aTime;
      });
      setAppointments(data);

      const names: Record<string, string> = {};
      for (const apt of data) {
        if (!names[apt.facilitatorId]) {
          try {
            const userDoc = await userService.getUser(apt.facilitatorId);
            if (userDoc) names[apt.facilitatorId] = userDoc.displayName || 'Unknown Facilitator';
          } catch { /* ignore */ }
        }
      }
      setFacilitatorNames(names);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleCancel = useCallback(async (appointmentId: string) => {
    if (!session) return;
    setActionLoading(appointmentId);
    try {
      await appointmentService.cancelAppointment(appointmentId, session.role, session.uid);
      await loadAppointments();
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
    } finally {
      setActionLoading(null);
    }
  }, [session, loadAppointments]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading appointments...</Text>
      </View>
    );
  }

  if (appointments.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>{'\uD83D\uDCC5'}</Text>
        <Text style={styles.emptyTitle}>No Appointments</Text>
        <Text style={styles.emptyDescription}>
          You haven't booked any appointments yet. Browse facilitators to find someone to talk to.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('StudentTabs', { screen: 'StudentCourses' })}
          style={styles.findButton}
        >
          <Text style={styles.findButtonText}>Find a Facilitator</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>My Appointments</Text>
      <View style={styles.appointmentList}>
        {appointments.map(apt => (
          <View key={apt.id} style={styles.appointmentCard}>
            <View style={styles.appointmentHeader}>
              <View style={styles.appointmentInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.facilitatorName}>
                    {facilitatorNames[apt.facilitatorId] || 'Facilitator'}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusBg(apt.status) }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(apt.status) }]}>
                      {apt.status === 'no_show' ? 'No Show' : apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.appointmentTime}>{formatDateTime(apt.scheduledAt)}</Text>
                <Text style={styles.appointmentDuration}>{apt.durationMinutes} minutes</Text>
                {apt.notes && (
                  <Text style={styles.notesText}>Note: {apt.notes}</Text>
                )}
                {apt.outcomeNotes && apt.status === 'completed' && (
                  <Text style={styles.outcomeText}>
                    <Text style={{ fontWeight: '600' }}>Outcome:</Text> {apt.outcomeNotes}
                  </Text>
                )}
              </View>
              <View style={styles.actionColumn}>
                {apt.status === 'requested' && (
                  <TouchableOpacity
                    onPress={() => handleCancel(apt.id)}
                    disabled={actionLoading === apt.id}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => navigation.navigate('StudentTabs', { screen: 'StudentMessages' })}
                  style={styles.messageButton}
                >
                  <Text style={styles.messageButtonText}>Message</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  contentContainer: { padding: 16, gap: 16, paddingBottom: 40 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: lightColors.background, padding: 24, gap: 12 },
  loadingText: { fontSize: 14, color: lightColors.textSecondary, marginTop: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: lightColors.text },
  emptyDescription: { fontSize: 14, color: lightColors.textSecondary, textAlign: 'center', lineHeight: 20 },
  findButton: { backgroundColor: lightColors.primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  findButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  title: { fontSize: 22, fontWeight: '700', color: lightColors.text },
  appointmentList: { gap: 10 },
  appointmentCard: { backgroundColor: lightColors.surface, borderWidth: 1, borderColor: lightColors.border, borderRadius: 12, padding: 14 },
  appointmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  appointmentInfo: { flex: 1, marginRight: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  facilitatorName: { fontSize: 15, fontWeight: '700', color: lightColors.text },
  statusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '600' },
  appointmentTime: { fontSize: 13, color: lightColors.textSecondary },
  appointmentDuration: { fontSize: 11, color: lightColors.textMuted, marginTop: 1 },
  notesText: { fontSize: 13, color: lightColors.textSecondary, fontStyle: 'italic', marginTop: 6 },
  outcomeText: { fontSize: 13, color: lightColors.textSecondary, marginTop: 6, lineHeight: 18 },
  actionColumn: { gap: 6 },
  cancelButton: { borderWidth: 1.5, borderColor: lightColors.error, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  cancelButtonText: { fontSize: 12, fontWeight: '600', color: lightColors.error },
  messageButton: { borderWidth: 1.5, borderColor: lightColors.infoBadgeText, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  messageButtonText: { fontSize: 12, fontWeight: '600', color: lightColors.infoBadgeText },
});