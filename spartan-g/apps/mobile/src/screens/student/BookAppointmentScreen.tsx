import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, appointmentSlotService, appointmentService, userService } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Props = NativeStackScreenProps<StudentMobileStackParamList, 'BookAppointment'>;

export function BookAppointmentScreen({ route, navigation }: Props) {
  const { facilitatorId } = route.params;
  const session = useAuthStore((s) => s.session);

  const [facilitator, setFacilitator] = useState<{ displayName: string; email: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingMessage, setBookingMessage] = useState('');

  useEffect(() => {
    if (!session) return;
    setIsLoading(false);
    userService.getUser(facilitatorId).then(u => {
      if (u) setFacilitator({ displayName: u.displayName || 'Facilitator', email: u.email || '' });
    }).catch(() => {});
  }, [facilitatorId, session]);

  useEffect(() => {
    if (!session || !facilitatorId) return;
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
    appointmentSlotService.getAvailableSlotsByDateRange(facilitatorId, startOfMonth, endOfMonth, session.role)
      .then(setAvailableSlots)
      .catch(() => setAvailableSlots([]));
  }, [facilitatorId, currentMonth, currentYear, session]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return availableSlots.filter((slot: any) => {
      const slotDate = slot.startTime.toDate();
      return slotDate.toDateString() === selectedDate.toDateString();
    });
  }, [availableSlots, selectedDate]);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const prevMonth = useCallback(() => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  }, [currentMonth]);

  const nextMonth = useCallback(() => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  }, [currentMonth]);

  const handleDateSelect = useCallback((day: number) => {
    setSelectedSlot(null);
    setSelectedDate(new Date(currentYear, currentMonth, day));
  }, [currentYear, currentMonth]);

  const handleBook = useCallback(async () => {
    if (!session || !facilitatorId || !selectedSlot) return;
    setIsBooking(true);
    try {
      const scheduledAt = selectedSlot.startTime.toDate();
      const appointmentId = `${facilitatorId}_${session.uid}_${Date.now()}`;
      await appointmentSlotService.reserveSlot(selectedSlot.id, appointmentId, session.role);

      const appointmentPayload: any = {
        studentId: session.uid,
        facilitatorId,
        scheduledAt,
        durationMinutes: 60,
      };
      if (notes.trim()) {
        appointmentPayload.notes = notes.trim();
      }
      await appointmentService.requestAppointment(appointmentPayload, session.role);

      setBookingMessage('Appointment requested successfully!');
      setTimeout(() => navigation.goBack(), 2000);
    } catch (error) {
      console.error('Failed to book appointment:', error);
    } finally {
      setIsBooking(false);
    }
  }, [session, facilitatorId, selectedSlot, notes, navigation]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (bookingMessage) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Appointment Requested</Text>
        <Text style={styles.successMessage}>{bookingMessage}</Text>
      </View>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Facilitator info */}
      <View style={styles.facilitatorInfoCard}>
        <Text style={styles.bookingTitle}>
          Book with {facilitator?.displayName || 'Facilitator'}
        </Text>
        <Text style={styles.facilitatorEmailText}>{facilitator?.email}</Text>
      </View>

      {/* Calendar */}
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={prevMonth} style={styles.calendarArrow}>
            <Text style={styles.calendarArrowText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.calendarMonth}>{MONTHS[currentMonth]} {currentYear}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.calendarArrow}>
            <Text style={styles.calendarArrowText}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.calendarGrid}>
          {DAY_HEADERS.map((d, i) => (
            <View key={`${d}-${i}`} style={styles.calendarDayHeader}>
              <Text style={styles.calendarDayHeaderText}>{d}</Text>
            </View>
          ))}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.calendarDay} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const date = new Date(currentYear, currentMonth, day);
            const isPast = date < today;
            const isSelected = date.toDateString() === selectedDate.toDateString();

            return (
              <TouchableOpacity
                key={day}
                disabled={isPast}
                onPress={() => handleDateSelect(day)}
                style={[
                  styles.calendarDay,
                  isSelected && styles.calendarDaySelected,
                  isPast && styles.calendarDayPast,
                ]}
              >
                <Text style={[
                  styles.calendarDayText,
                  isSelected && styles.calendarDayTextSelected,
                  isPast && styles.calendarDayTextPast,
                ]}>
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Time slots */}
      <View style={styles.slotsCard}>
        <Text style={styles.slotsTitle}>Available Slots</Text>
        {slotsForSelectedDate.length === 0 ? (
          <Text style={styles.noSlotsText}>No available slots for this date</Text>
        ) : (
          <View style={styles.slotsGrid}>
            {slotsForSelectedDate.map((slot: any) => {
              const start = slot.startTime.toDate();
              const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              const isSelected = selectedSlot?.id === slot.id;
              return (
                <TouchableOpacity
                  key={slot.id}
                  onPress={() => setSelectedSlot(slot)}
                  style={[styles.slotButton, isSelected && styles.slotButtonSelected]}
                >
                  <Text style={[styles.slotButtonText, isSelected && styles.slotButtonTextSelected]}>
                    {timeStr}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Notes */}
      <View style={styles.notesCard}>
        <Text style={styles.notesLabel}>Notes (optional)</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Brief reason for the appointment..."
          placeholderTextColor={lightColors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* Book button */}
      <TouchableOpacity
        onPress={handleBook}
        disabled={!selectedSlot || isBooking}
        style={[styles.bookButton, (!selectedSlot || isBooking) && styles.bookButtonDisabled]}
      >
        <Text style={styles.bookButtonText}>
          {isBooking ? 'Booking...' : 'Request Appointment'}
        </Text>
      </TouchableOpacity>
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
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: lightColors.successBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconText: {
    fontSize: 32,
    fontWeight: '700',
    color: lightColors.successText,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 8,
  },
  successMessage: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
  },
  facilitatorInfoCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  bookingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
  },
  facilitatorEmailText: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 2,
  },
  calendarCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: lightColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarArrowText: {
    fontSize: 16,
    fontWeight: '600',
    color: lightColors.primary,
  },
  calendarMonth: {
    fontSize: 16,
    fontWeight: '600',
    color: lightColors.text,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayHeader: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  calendarDayHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: lightColors.textMuted,
  },
  calendarDay: {
    width: '14.28%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  calendarDaySelected: {
    backgroundColor: lightColors.primary,
    borderRadius: 20,
  },
  calendarDayPast: {
    opacity: 0.3,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '500',
    color: lightColors.text,
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calendarDayTextPast: {
    color: lightColors.textMuted,
  },
  slotsCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  slotsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.textSecondary,
    marginBottom: 12,
  },
  noSlotsText: {
    fontSize: 13,
    color: lightColors.textMuted,
    fontStyle: 'italic',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotButton: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  slotButtonSelected: {
    borderColor: lightColors.primary,
    backgroundColor: lightColors.primary,
  },
  slotButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.textSecondary,
  },
  slotButtonTextSelected: {
    color: '#FFFFFF',
  },
  notesCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.textSecondary,
    marginBottom: 8,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: lightColors.text,
    backgroundColor: lightColors.background,
    minHeight: 80,
  },
  bookButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookButtonDisabled: {
    opacity: 0.5,
  },
  bookButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});