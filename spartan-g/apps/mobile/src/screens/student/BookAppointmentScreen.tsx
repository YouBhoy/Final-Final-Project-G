import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useAuthStore, appointmentService, workHoursService, userService } from '@spartan-g/shared-services';
import type { WorkHoursScheduleDocument } from '@spartan-g/shared-types';
import { isSameWeek } from '@spartan-g/shared-types';
import { lightColors, formatWorkHours } from '@spartan-g/shared-ui';
import { TimePickerDropdown, TIME_OPTIONS } from '../../components/TimePickerDropdown';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const APPOINTMENT_DURATION_MINUTES = 60;

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

type Props = NativeStackScreenProps<StudentMobileStackParamList, 'BookAppointment'>;

export function BookAppointmentScreen({ route, navigation }: Props) {
  const { facilitatorId } = route.params;
  const session = useAuthStore((s) => s.session);

  const [facilitator, setFacilitator] = useState<{ displayName: string; email: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [workHoursForDay, setWorkHoursForDay] = useState<{ startTime: string; endTime: string } | null>(null);
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingMessage, setBookingMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    setIsLoading(false);
    userService.getUser(facilitatorId).then(u => {
      if (u) setFacilitator({ displayName: u.displayName || 'Facilitator', email: u.email || '' });
    }).catch(() => {});
  }, [facilitatorId, session]);

  // Load work hours for the selected date's day of week
  useEffect(() => {
    if (!session || !facilitatorId) return;
    setError('');
    // Only the facilitator's current week of hours is bookable — dates in past
    // or future weeks are never offered even if the same weekday was set once.
    if (!isSameWeek(selectedDate, new Date())) {
      setWorkHoursForDay(null);
      return;
    }
    workHoursService.getActiveSchedule(facilitatorId, session.role)
      .then((schedules: WorkHoursScheduleDocument[]) => {
        const daySchedule = schedules.find((s) => s.dayOfWeek === selectedDate.getDay());
        if (daySchedule) {
          setWorkHoursForDay({ startTime: daySchedule.startTime, endTime: daySchedule.endTime });
          setSelectedTime(daySchedule.startTime);
        } else {
          setWorkHoursForDay(null);
        }
      })
      .catch((err: any) => {
        console.error('[BookAppointment] Failed to load work hours:', err);
        setWorkHoursForDay(null);
      });
  }, [facilitatorId, selectedDate, session]);

  // Time options restricted to the facilitator's available hours for the day,
  // leaving room for the full 60-minute appointment duration.
  const availableTimeOptions = useMemo(() => {
    if (!workHoursForDay) return [];
    const startMin = timeToMinutes(workHoursForDay.startTime);
    const endMin = timeToMinutes(workHoursForDay.endTime);
    return TIME_OPTIONS.filter((o) => {
      const optMin = timeToMinutes(o.value);
      return optMin >= startMin && optMin + APPOINTMENT_DURATION_MINUTES <= endMin;
    });
  }, [workHoursForDay]);

  // Keep the selected time within the available options whenever the day's
  // hours change (e.g. default to the first valid slot of the day).
  useEffect(() => {
    if (!workHoursForDay) return;
    if (availableTimeOptions.length === 0) {
      setSelectedTime('');
      return;
    }
    if (!availableTimeOptions.some((o) => o.value === selectedTime)) {
      setSelectedTime(availableTimeOptions[0].value);
    }
  }, [workHoursForDay, availableTimeOptions, selectedTime]);

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
    setError('');
    setSelectedDate(new Date(currentYear, currentMonth, day));
  }, [currentYear, currentMonth]);

  const handleBook = useCallback(async () => {
    if (!session || !facilitatorId || !workHoursForDay || !selectedTime) return;
    setIsBooking(true);
    setError('');
    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

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

      setBookingMessage('Appointment requested successfully! The facilitator will be notified.');
      setTimeout(() => navigation.goBack(), 2000);
    } catch (error: any) {
      console.error('Failed to book appointment:', error);
      setError(error.message || 'Failed to book appointment');
    } finally {
      setIsBooking(false);
    }
  }, [session, facilitatorId, selectedDate, selectedTime, workHoursForDay, notes, navigation]);

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

      {/* Error message */}
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

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

      {/* Time slot (computed from work hours) */}
      <View style={styles.slotsCard}>
        <Text style={styles.slotsTitle}>Choose Your Time</Text>
        {!workHoursForDay ? (
          <View>
            <Text style={styles.noSlotsText}>
              The facilitator is not available on {DAY_NAMES[selectedDate.getDay()]}.
            </Text>
            <Text style={styles.noSlotsSubtext}>
              Please select another date.
            </Text>
          </View>
        ) : (
          <View style={styles.timePickerContainer}>
            <Text style={styles.workHoursInfo}>
              Available hours: <Text style={{ fontWeight: '700' }}>{formatWorkHours(workHoursForDay.startTime, workHoursForDay.endTime)}</Text>
            </Text>
            <View style={styles.timeRow}>
              <TimePickerDropdown
                value={selectedTime}
                onChange={setSelectedTime}
                options={availableTimeOptions}
                title="Choose Your Time"
                placeholder="No available times"
              />
              <Text style={styles.timeLabel}>60 min appointment</Text>
            </View>
            <Text style={styles.timeHint}>
              Make sure your chosen time allows for the full 60-minute appointment within the facilitator's available hours.
            </Text>
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
        disabled={!workHoursForDay || isBooking || availableTimeOptions.length === 0}
        style={[styles.bookButton, (!workHoursForDay || isBooking || availableTimeOptions.length === 0) && styles.bookButtonDisabled]}
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
  errorCard: {
    backgroundColor: lightColors.errorBackground,
    borderWidth: 1,
    borderColor: lightColors.errorBorder,
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    color: lightColors.errorText,
    lineHeight: 18,
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
    marginBottom: 4,
  },
  noSlotsSubtext: {
    fontSize: 13,
    color: lightColors.textMuted,
    fontStyle: 'italic',
  },
  timePickerContainer: {
    gap: 12,
  },
  workHoursInfo: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timeLabel: {
    fontSize: 13,
    color: lightColors.textMuted,
  },
  timeHint: {
    fontSize: 12,
    color: lightColors.warningText,
    lineHeight: 16,
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