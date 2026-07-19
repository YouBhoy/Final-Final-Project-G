import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useAuthStore, appointmentSlotService, workHoursService, userService } from '@spartan-g/shared-services';
import type { AppointmentSlotDocument, WorkHoursScheduleDocument } from '@spartan-g/shared-types';
import { lightColors, formatDateTime, formatWorkHours } from '@spartan-g/shared-ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatDateOnly(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SlotsScreen() {
  const session = useAuthStore((s) => s.session);

  const [slots, setSlots] = useState<(AppointmentSlotDocument & { id: string })[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const [workHours, setWorkHours] = useState<(WorkHoursScheduleDocument & { id: string })[]>([]);

  const loadSlots = useCallback(async () => {
    if (!session) return;
    try {
      const data = await appointmentSlotService.getSlots(session.uid, session.role);
      setSlots(data);

      // Look up student names for reserved/completed/cancelled slots
      const names: Record<string, string> = {};
      const occupiedSlots = data.filter(s => s.status !== 'available' && s.appointmentId);
      for (const slot of occupiedSlots) {
        if (!slot.appointmentId) continue;
        try {
          const idParts = slot.appointmentId.split('_');
          if (idParts.length >= 3) {
            const studentId = idParts[idParts.length - 2];
            if (studentId && !names[studentId]) {
              try {
                const userDoc = await userService.getUser(studentId);
                if (userDoc) {
                  names[studentId] = userDoc.displayName || userDoc.email || 'Unknown Student';
                } else {
                  names[studentId] = 'Unknown Student';
                }
              } catch {
                names[studentId] = 'Unknown Student';
              }
            }
          }
        } catch { /* ignore */ }
      }
      setStudentNames(names);
    } catch (error: any) {
      console.error('Failed to load slots:', error);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const loadWorkHours = useCallback(async () => {
    if (!session) return;
    try {
      const data = await workHoursService.getSchedule(session.uid, session.role);
      setWorkHours(data);
    } catch (error) {
      console.error('Failed to load work hours:', error);
    }
  }, [session]);

  useEffect(() => {
    loadSlots();
    loadWorkHours();
  }, [loadSlots, loadWorkHours]);

  const handleCreateSlot = useCallback(async () => {
    if (!session) return;
    setSaving(true);
    try {
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);

      const start = new Date(selectedDate);
      start.setHours(startHour, startMinute, 0, 0);

      const end = new Date(selectedDate);
      end.setHours(endHour, endMinute, 0, 0);

      await appointmentSlotService.createSlot({
        facilitatorId: session.uid,
        startTime: start,
        endTime: end,
      }, session.role);

      await loadSlots();
      setShowCreateForm(false);
    } catch (error) {
      console.error('Failed to create slot:', error);
    } finally {
      setSaving(false);
    }
  }, [session, selectedDate, startTime, endTime, loadSlots]);

  const handleDeleteSlot = useCallback(async (slotId: string) => {
    if (!session) return;
    try {
      await appointmentSlotService.deleteSlot(slotId, session.uid, session.role);
      await loadSlots();
    } catch (error) {
      console.error('Failed to delete slot:', error);
    }
  }, [session, loadSlots]);

  const handleDateChange = useCallback((delta: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + delta);
    setSelectedDate(newDate);
  }, [selectedDate]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading slots...</Text>
      </View>
    );
  }

  const availableSlots = slots.filter(s => s.status === 'available');
  const reservedSlots = slots.filter(s => s.status === 'reserved');
  const completedSlots = slots.filter(s => s.status === 'completed');
  const cancelledSlots = slots.filter(s => s.status === 'cancelled');

  const dayIndex = selectedDate.getDay();
  const daySchedule = workHours.find(s => s.dayOfWeek === dayIndex);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Appointment Slots</Text>
        <TouchableOpacity
          onPress={() => setShowCreateForm(!showCreateForm)}
          style={[styles.createButton, showCreateForm && styles.createButtonCancel]}
        >
          <Text style={[styles.createButtonText, showCreateForm && styles.createButtonTextCancel]}>
            {showCreateForm ? 'Cancel' : 'Create Slot'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Create form */}
      {showCreateForm && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Create New Slot</Text>

          {/* Date selector */}
          <View style={styles.dateSelector}>
            <TouchableOpacity onPress={() => handleDateChange(-1)} style={styles.dateArrow}>
              <Text style={styles.dateArrowText}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={styles.dateText}>{formatDateOnly(selectedDate)}</Text>
            <TouchableOpacity onPress={() => handleDateChange(1)} style={styles.dateArrow}>
              <Text style={styles.dateArrowText}>{'>'}</Text>
            </TouchableOpacity>
          </View>

          {/* Time inputs */}
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={styles.fieldLabel}>Start Time</Text>
              <TextInput
                style={styles.timeInput}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                placeholderTextColor={lightColors.textMuted}
                autoComplete="off"
              />
            </View>
            <View style={styles.timeField}>
              <Text style={styles.fieldLabel}>End Time</Text>
              <TextInput
                style={styles.timeInput}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="10:00"
                placeholderTextColor={lightColors.textMuted}
                autoComplete="off"
              />
            </View>
          </View>

          {/* Work hours info */}
          {!daySchedule ? (
            <View style={[styles.workHoursInfo, { backgroundColor: lightColors.warningBackground, borderColor: lightColors.warningBorder }]}>
              <Text style={[styles.workHoursInfoText, { color: lightColors.warningText }]}>
                No work hours configured for {DAYS[dayIndex]}. Please set them in the Work Hours page before creating slots on this day.
              </Text>
            </View>
          ) : !daySchedule.isActive ? (
            <View style={[styles.workHoursInfo, { backgroundColor: lightColors.warningBackground, borderColor: lightColors.warningBorder }]}>
              <Text style={[styles.workHoursInfoText, { color: lightColors.warningText }]}>
                Work hours for {DAYS[dayIndex]} ({formatWorkHours(daySchedule.startTime, daySchedule.endTime)}) are currently inactive. Enable them in the Work Hours page.
              </Text>
            </View>
          ) : (
            <View style={[styles.workHoursInfo, { backgroundColor: lightColors.infoBackground, borderColor: lightColors.infoBorder }]}>
              <Text style={[styles.workHoursInfoText, { color: lightColors.infoText }]}>
                Work hours for {DAYS[dayIndex]}: <Text style={{ fontWeight: '700' }}>{formatWorkHours(daySchedule.startTime, daySchedule.endTime)}</Text>
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleCreateSlot}
            disabled={saving}
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
          >
            <Text style={styles.submitButtonText}>{saving ? 'Creating...' : 'Create Slot'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Available Slots */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Available ({availableSlots.length})</Text>
        {availableSlots.length === 0 ? (
          <Text style={styles.emptyText}>No available slots. Create one above.</Text>
        ) : (
          <View style={styles.slotList}>
            {availableSlots.map(slot => (
              <View key={slot.id} style={styles.slotRow}>
                <View>
                  <Text style={styles.slotTime}>{formatDateTime(slot.startTime)}</Text>
                  <Text style={styles.slotSubtext}>
                    {formatDateTime(slot.startTime)} - {formatDateTime(slot.endTime)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteSlot(slot.id)}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Reserved Slots */}
      {reservedSlots.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Reserved ({reservedSlots.length})</Text>
          <View style={styles.slotList}>
            {reservedSlots.map(slot => {
              const studentId = slot.appointmentId?.split('_')?.[slot.appointmentId.split('_').length - 2] || '';
              return (
                <View key={slot.id} style={[styles.slotRow, styles.slotRowReserved]}>
                  <View>
                    <Text style={styles.slotTime}>{formatDateTime(slot.startTime)}</Text>
                    <Text style={styles.reservedByText}>
                      Reserved by: <Text style={{ fontWeight: '700' }}>{studentNames[studentId] || 'Loading...'}</Text>
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Completed Slots */}
      {completedSlots.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Completed ({completedSlots.length})</Text>
          <View style={styles.slotList}>
            {completedSlots.map(slot => (
              <View key={slot.id} style={[styles.slotRow, styles.slotRowCompleted]}>
                <View>
                  <Text style={styles.slotTime}>{formatDateTime(slot.startTime)}</Text>
                  <Text style={styles.slotSubtext}>Appointment: {slot.appointmentId}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Cancelled Slots */}
      {cancelledSlots.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Cancelled ({cancelledSlots.length})</Text>
          <View style={styles.slotList}>
            {cancelledSlots.map(slot => (
              <View key={slot.id} style={[styles.slotRow, styles.slotRowCancelled]}>
                <View>
                  <Text style={styles.slotTime}>{formatDateTime(slot.startTime)}</Text>
                  <Text style={styles.slotSubtext}>Appointment: {slot.appointmentId || 'N/A'}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.background,
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: lightColors.text,
  },
  createButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createButtonCancel: {
    backgroundColor: lightColors.surface,
    borderWidth: 1.5,
    borderColor: lightColors.border,
  },
  createButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  createButtonTextCancel: {
    color: lightColors.textSecondary,
  },
  formCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  dateArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateArrowText: {
    fontSize: 16,
    fontWeight: '600',
    color: lightColors.primary,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '600',
    color: lightColors.text,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: lightColors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: lightColors.text,
    backgroundColor: lightColors.background,
    textAlign: 'center',
  },
  workHoursInfo: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  workHoursInfoText: {
    fontSize: 12,
    lineHeight: 16,
  },
  submitButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: lightColors.textMuted,
    fontStyle: 'italic',
  },
  slotList: {
    gap: 8,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    padding: 12,
  },
  slotRowReserved: {
    backgroundColor: lightColors.warningBackground,
    borderColor: lightColors.warningBorder,
  },
  slotRowCompleted: {
    backgroundColor: lightColors.successBackground,
    borderColor: lightColors.successBackground,
  },
  slotRowCancelled: {
    backgroundColor: lightColors.neutralBackground,
    borderColor: lightColors.border,
  },
  slotTime: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.text,
  },
  slotSubtext: {
    fontSize: 11,
    color: lightColors.textMuted,
    marginTop: 2,
  },
  reservedByText: {
    fontSize: 12,
    color: lightColors.warningText,
    marginTop: 2,
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: lightColors.error,
  },
});