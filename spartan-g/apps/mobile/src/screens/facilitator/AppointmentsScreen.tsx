import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useAuthStore, appointmentService, userService, pushNotificationService } from '@spartan-g/shared-services';
import type { AppointmentDocument } from '@spartan-g/shared-types';
import { lightColors, formatDateTime } from '@spartan-g/shared-ui';

function getAppointmentPushTitle(action: string): string | null {
  switch (action) {
    case 'accept': return 'Appointment Accepted';
    case 'complete': return 'Appointment Completed';
    case 'no-show': return 'Appointment Update';
    case 'cancel': return 'Appointment Cancelled';
    default: return null;
  }
}

function getAppointmentPushBody(action: string, studentName: string): string | null {
  switch (action) {
    case 'accept': return `Your appointment with ${studentName} has been accepted.`;
    case 'complete': return `Your appointment with ${studentName} has been completed.`;
    case 'no-show': return `You were marked as no-show for your appointment with ${studentName}.`;
    case 'cancel': return `Your appointment with ${studentName} has been cancelled.`;
    default: return null;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'requested': return '#92400E';
    case 'accepted': return '#4338CA';
    case 'completed': return '#16A34A';
    case 'cancelled': return '#B91C1C';
    case 'rejected': return '#475569';
    case 'no_show': return '#6D28D9';
    default: return lightColors.textSecondary;
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'requested': return '#FEF3C7';
    case 'accepted': return '#EEF2FF';
    case 'completed': return '#DCFCE7';
    case 'cancelled': return '#FEE2E2';
    case 'rejected': return '#F1F5F9';
    case 'no_show': return '#F3E8FF';
    default: return lightColors.neutralBackground;
  }
}

export function AppointmentsScreen() {
  const session = useAuthStore((s) => s.session);

  const [appointments, setAppointments] = useState<(AppointmentDocument & { id: string })[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<(AppointmentDocument & { id: string }) | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [facilitatorNotes, setFacilitatorNotes] = useState('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);

  const loadAppointments = useCallback(async () => {
    if (!session) return;
    try {
      const data = await appointmentService.getAppointments(session.uid, session.role);
      setAppointments(data);

      const names: Record<string, string> = {};
      for (const apt of data) {
        if (!names[apt.studentId]) {
          try {
            const userDoc = await userService.getUser(apt.studentId);
            if (userDoc) names[apt.studentId] = userDoc.displayName || 'Unknown Student';
          } catch { /* ignore */ }
        }
      }
      setStudentNames(names);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleAction = useCallback(async (action: string, appointmentId: string) => {
    if (!session) return;
    setActionLoading(appointmentId);
    let aptStudentId: string | null = null;
    try {
      switch (action) {
        case 'accept': {
          const apt = appointments.find(a => a.id === appointmentId);
          aptStudentId = apt?.studentId ?? null;
          await appointmentService.acceptAppointment(appointmentId, session.uid, session.role);
          break;
        }
        case 'reject':
          await appointmentService.rejectAppointment(appointmentId, session.uid, session.role);
          break;
        case 'complete': {
          const apt = selectedAppointment;
          aptStudentId = apt?.studentId ?? null;
          if (!outcomeNotes.trim()) return;
          await appointmentService.completeAppointment(appointmentId, session.uid, outcomeNotes, session.role);
          setOutcomeNotes('');
          setShowCompleteModal(false);
          setSelectedAppointment(null);
          break;
        }
        case 'no-show': {
          const apt = appointments.find(a => a.id === appointmentId);
          aptStudentId = apt?.studentId ?? null;
          await appointmentService.markNoShow(appointmentId, session.uid, session.role);
          break;
        }
        case 'cancel': {
          const apt = appointments.find(a => a.id === appointmentId);
          aptStudentId = apt?.studentId ?? null;
          await appointmentService.cancelAppointment(appointmentId, session.role, session.uid);
          break;
        }
      }
      await loadAppointments();

      // Send push notification to student (non-blocking)
      if (aptStudentId) {
        const pushTitle = getAppointmentPushTitle(action);
        const pushBody = getAppointmentPushBody(action, studentNames[aptStudentId] ?? 'Student');
        if (pushTitle && pushBody) {
          pushNotificationService.sendPushToRecipient(
            aptStudentId,
            pushTitle,
            pushBody,
            { url: 'spartan-g://student/home' },
          ).catch(() => { /* Intentionally swallowed */ });
        }
      }
    } catch (error) {
      console.error(`Failed to ${action} appointment:`, error);
    } finally {
      setActionLoading(null);
    }
  }, [session, outcomeNotes, loadAppointments, appointments, selectedAppointment, studentNames]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading appointments...</Text>
      </View>
    );
  }

  const pendingRequests = appointments.filter(a => a.status === 'requested');
  const upcoming = appointments.filter(a => a.status === 'accepted');
  const history = appointments.filter(a => ['completed', 'cancelled', 'rejected', 'no_show'].includes(a.status));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Pending Requests */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Appointment Requests ({pendingRequests.length})</Text>
        {pendingRequests.length === 0 ? (
          <Text style={styles.emptyText}>No pending appointment requests.</Text>
        ) : (
          <View style={styles.appointmentList}>
            {pendingRequests.map(apt => (
              <View key={apt.id} style={styles.appointmentCard}>
                <View style={styles.appointmentHeader}>
                  <View>
                    <Text style={styles.studentName}>{studentNames[apt.studentId] || 'Student'}</Text>
                    <Text style={styles.appointmentTime}>{formatDateTime(apt.scheduledAt)}</Text>
                    <Text style={styles.appointmentDuration}>{apt.durationMinutes} minutes</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusBg(apt.status) }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(apt.status) }]}>
                      {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                    </Text>
                  </View>
                </View>
                {apt.notes && (
                  <Text style={styles.notesText}>"{apt.notes}"</Text>
                )}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => handleAction('accept', apt.id)}
                    disabled={actionLoading === apt.id}
                    style={[styles.actionButton, { backgroundColor: lightColors.successText }]}
                  >
                    <Text style={styles.actionButtonText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAction('reject', apt.id)}
                    disabled={actionLoading === apt.id}
                    style={[styles.actionButton, { backgroundColor: lightColors.error }]}
                  >
                    <Text style={styles.actionButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setSelectedAppointment(apt); setFacilitatorNotes(apt.facilitatorNotes || ''); setShowNotesModal(true); }}
                    style={[styles.actionButton, { backgroundColor: lightColors.surface, borderWidth: 1, borderColor: lightColors.border }]}
                  >
                    <Text style={[styles.actionButtonText, { color: lightColors.textSecondary }]}>Notes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Upcoming */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Upcoming ({upcoming.length})</Text>
        {upcoming.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming appointments.</Text>
        ) : (
          <View style={styles.appointmentList}>
            {upcoming.map(apt => (
              <View key={apt.id} style={styles.appointmentCard}>
                <View style={styles.appointmentHeader}>
                  <View>
                    <Text style={styles.studentName}>{studentNames[apt.studentId] || 'Student'}</Text>
                    <Text style={styles.appointmentTime}>{formatDateTime(apt.scheduledAt)}</Text>
                    <Text style={styles.appointmentDuration}>{apt.durationMinutes} minutes</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusBg(apt.status) }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(apt.status) }]}>
                      {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                    </Text>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => { setSelectedAppointment(apt); setOutcomeNotes(''); setShowCompleteModal(true); }}
                    style={[styles.actionButton, { backgroundColor: lightColors.infoBadgeText }]}
                  >
                    <Text style={styles.actionButtonText}>Complete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAction('no-show', apt.id)}
                    disabled={actionLoading === apt.id}
                    style={[styles.actionButton, { backgroundColor: '#7C3AED' }]}
                  >
                    <Text style={styles.actionButtonText}>No Show</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAction('cancel', apt.id)}
                    disabled={actionLoading === apt.id}
                    style={[styles.actionButton, { backgroundColor: lightColors.textMuted }]}
                  >
                    <Text style={styles.actionButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setSelectedAppointment(apt); setFacilitatorNotes(apt.facilitatorNotes || ''); setShowNotesModal(true); }}
                    style={[styles.actionButton, { backgroundColor: lightColors.surface, borderWidth: 1, borderColor: lightColors.border }]}
                  >
                    <Text style={[styles.actionButtonText, { color: lightColors.textSecondary }]}>Notes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* History */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>History</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>No appointment history.</Text>
        ) : (
          <View style={styles.appointmentList}>
            {history.map(apt => (
              <View key={apt.id} style={styles.historyRow}>
                <View>
                  <Text style={styles.studentName}>{studentNames[apt.studentId] || 'Student'}</Text>
                  <Text style={styles.appointmentTime}>{formatDateTime(apt.scheduledAt)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusBg(apt.status) }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(apt.status) }]}>
                    {apt.status === 'no_show' ? 'No Show' : apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Complete Modal */}
      <Modal visible={showCompleteModal} transparent animationType="fade" onRequestClose={() => { setShowCompleteModal(false); setOutcomeNotes(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Complete Appointment</Text>
            <Text style={styles.modalDescription}>
              Add outcome notes for the appointment with {selectedAppointment ? studentNames[selectedAppointment.studentId] || 'student' : ''}.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={outcomeNotes}
              onChangeText={setOutcomeNotes}
              placeholder="Enter outcome notes..."
              placeholderTextColor={lightColors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => { setShowCompleteModal(false); setOutcomeNotes(''); }}
                style={[styles.modalButton, { borderWidth: 1, borderColor: lightColors.border }]}
              >
                <Text style={[styles.modalButtonText, { color: lightColors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => selectedAppointment && handleAction('complete', selectedAppointment.id)}
                style={[styles.modalButton, { backgroundColor: lightColors.primary }]}
              >
                <Text style={[styles.modalButtonText, { color: '#FFFFFF' }]}>Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Notes Modal */}
      <Modal visible={showNotesModal} transparent animationType="fade" onRequestClose={() => setShowNotesModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Facilitator Notes</Text>
            <TextInput
              style={styles.modalInput}
              value={facilitatorNotes}
              onChangeText={setFacilitatorNotes}
              placeholder="Private notes for this appointment..."
              placeholderTextColor={lightColors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowNotesModal(false)}
                style={[styles.modalButton, { borderWidth: 1, borderColor: lightColors.border }]}
              >
                <Text style={[styles.modalButtonText, { color: lightColors.textSecondary }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  contentContainer: { padding: 16, gap: 16, paddingBottom: 40 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: lightColors.background, padding: 24, gap: 12 },
  loadingText: { fontSize: 14, color: lightColors.textSecondary, marginTop: 8 },
  sectionCard: { backgroundColor: lightColors.surface, borderWidth: 1, borderColor: lightColors.border, borderRadius: 12, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: lightColors.text, marginBottom: 12 },
  emptyText: { fontSize: 13, color: lightColors.textMuted, fontStyle: 'italic' },
  appointmentList: { gap: 10 },
  appointmentCard: { borderWidth: 1, borderColor: lightColors.border, borderRadius: 10, padding: 14 },
  appointmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  studentName: { fontSize: 14, fontWeight: '600', color: lightColors.text },
  appointmentTime: { fontSize: 13, color: lightColors.textSecondary, marginTop: 2 },
  appointmentDuration: { fontSize: 11, color: lightColors.textMuted, marginTop: 1 },
  statusBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  notesText: { fontSize: 13, color: lightColors.textSecondary, fontStyle: 'italic', marginBottom: 8 },
  actionRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actionButton: { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', minHeight: 34 },
  actionButtonText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: lightColors.border, borderRadius: 8, padding: 12 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: lightColors.surface, borderRadius: 16, padding: 20, gap: 14 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: lightColors.text },
  modalDescription: { fontSize: 14, color: lightColors.textSecondary, lineHeight: 20 },
  modalInput: { borderWidth: 1, borderColor: lightColors.border, borderRadius: 8, padding: 12, fontSize: 14, color: lightColors.text, backgroundColor: lightColors.background, minHeight: 100, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalButton: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  modalButtonText: { fontSize: 13, fontWeight: '600' },
});