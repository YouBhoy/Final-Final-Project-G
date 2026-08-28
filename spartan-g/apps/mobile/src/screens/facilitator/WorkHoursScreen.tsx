import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore, workHoursService } from '@spartan-g/shared-services';
import type { WorkHoursScheduleDocument } from '@spartan-g/shared-types';
import { lightColors, formatWorkHours } from '@spartan-g/shared-ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * All selectable times in 30-minute increments, from 7:00 AM to 7:00 PM
 * (inclusive). `value` is the canonical 24-hour zero-padded "HH:MM" string that
 * is stored in Firestore (WorkHoursScheduleDocument.startTime/endTime). `label`
 * is the user-friendly 12-hour AM/PM display. Only the UI input range changed —
 * the stored value format is preserved so appointment booking logic keeps working.
 */
const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const options: { value: string; label: string }[] = [];
  const startMinutes = 7 * 60; // 7:00 AM
  const endMinutes = 19 * 60;  // 7:00 PM (inclusive)
  for (let t = startMinutes; t <= endMinutes; t += 30) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const date = new Date();
    date.setHours(h, m);
    const label = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    options.push({ value, label });
  }
  return options;
})();

/**
 * Resolve the 12-hour AM/PM label for a stored "HH:MM" value.
 * Falls back to formatting any valid 24-hour "HH:MM" string so that a saved
 * start/end time outside the 7:00 AM - 7:00 PM picker range still displays
 * cleanly (e.g. "05:00" -> "5:00 AM") instead of showing raw text.
 */
function timeLabel(value: string): string {
  const existing = TIME_OPTIONS.find((o) => o.value === value);
  if (existing) return existing.label;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function WorkHoursScreen() {
  const session = useAuthStore((s) => s.session);

  const [schedules, setSchedules] = useState<(WorkHoursScheduleDocument & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);

  const loadSchedules = useCallback(async () => {
    if (!session) return;
    try {
      const data = await workHoursService.getSchedule(session.uid, session.role);
      setSchedules(data);
    } catch (error) {
      console.error('Failed to load work hours:', error);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const handleToggleDay = useCallback(async (dayOfWeek: number) => {
    if (!session) return;
    const existing = schedules.find(s => s.dayOfWeek === dayOfWeek);

    if (existing) {
      setToggling(dayOfWeek);
      try {
        await workHoursService.toggleSchedule(existing.id, !existing.isActive, session.role);
        await loadSchedules();
      } catch (error) {
        console.error('Failed to toggle day:', error);
      } finally {
        setToggling(null);
      }
    } else {
      // No schedule exists — set editing mode to create one
      setEditingDay(dayOfWeek);
      setStartTime('09:00');
      setEndTime('17:00');
    }
  }, [session, schedules, loadSchedules]);

  const handleSaveTime = useCallback(async (dayOfWeek: number) => {
    if (!session) return;
    // Guard against invalid ranges (end before or equal to start).
    // Lexicographic comparison is valid because times are zero-padded "HH:MM".
    if (startTime >= endTime) return;
    setSaving(true);
    try {
      const existing = schedules.find(s => s.dayOfWeek === dayOfWeek);
      if (existing) {
        await workHoursService.updateScheduleEntry(existing.id, {
          startTime,
          endTime,
          isActive: true,
        } as Partial<WorkHoursScheduleDocument>, session.role);
      } else {
        await workHoursService.createScheduleEntry({
          facilitatorId: session.uid,
          dayOfWeek,
          startTime,
          endTime,
        }, session.role);
      }
      await loadSchedules();
      setEditingDay(null);
    } catch (error) {
      console.error('Failed to save work hours:', error);
    } finally {
      setSaving(false);
    }
  }, [session, startTime, endTime, schedules, loadSchedules]);

  const startEdit = useCallback((dayOfWeek: number) => {
    const existing = schedules.find(s => s.dayOfWeek === dayOfWeek);
    setStartTime(existing?.startTime || '09:00');
    setEndTime(existing?.endTime || '17:00');
    setEditingDay(dayOfWeek);
  }, [schedules]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading work hours...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.card}>
        <Text style={styles.title}>Work Hours</Text>
        <Text style={styles.subtitle}>
          Set your weekly availability. Students can book appointments during active hours.
        </Text>

        <View style={styles.dayList}>
          {DAYS.map((day, index) => {
            const schedule = schedules.find(s => s.dayOfWeek === index);
            const isActive = schedule?.isActive ?? false;
            const isEditing = editingDay === index;
            // Lexicographic compare works for zero-padded "HH:MM" strings.
            const isValidRange = startTime < endTime;

            return (
              <View key={index} style={[styles.dayRow, isActive && styles.dayRowActive]}>
                <View style={styles.dayLeft}>
                  <Switch
                    value={isActive}
                    onValueChange={() => handleToggleDay(index)}
                    trackColor={{ false: lightColors.border, true: lightColors.primary }}
                    thumbColor={isActive ? '#FFFFFF' : '#F4F3F4'}
                    disabled={toggling === index}
                  />
                  <Text style={[styles.dayName, !isActive && styles.dayNameInactive]}>
                    {day}
                  </Text>
                </View>

                {isEditing ? (
                  <View>
                    <View style={styles.editRow}>
                      <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => setPickerTarget('start')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.pickerButtonText}>{timeLabel(startTime)}</Text>
                        <Text style={styles.pickerChevron}>▾</Text>
                      </TouchableOpacity>
                      <Text style={styles.timeSeparator}>to</Text>
                      <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => setPickerTarget('end')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.pickerButtonText}>{timeLabel(endTime)}</Text>
                        <Text style={styles.pickerChevron}>▾</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleSaveTime(index)}
                        disabled={saving || !isValidRange}
                        style={[styles.saveButton, (saving || !isValidRange) && styles.saveButtonDisabled]}
                      >
                        <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setEditingDay(null)}
                        style={styles.cancelButton}
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                    {!isValidRange && (
                      <Text style={styles.errorText}>End time must be after start time.</Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.timeDisplay}>
                    <Text style={[styles.timeText, !isActive && styles.timeTextInactive]}>
                      {isActive ? formatWorkHours(schedule?.startTime || '09:00', schedule?.endTime || '17:00') : 'Inactive'}
                    </Text>
                    <TouchableOpacity onPress={() => startEdit(index)} style={styles.editLink}>
                      <Text style={styles.editLinkText}>
                        {isActive ? 'Edit' : 'Set Hours'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* Time picker dropdown */}
      <Modal
        visible={pickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerTarget(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerTarget(null)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{pickerTarget === 'start' ? 'Start Time' : 'End Time'}</Text>
            <FlatList
              data={TIME_OPTIONS}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const selected = pickerTarget === 'start' ? startTime : endTime;
                return (
                  <TouchableOpacity
                    style={[styles.modalOption, item.value === selected && styles.modalOptionSelected]}
                    onPress={() => {
                      if (pickerTarget === 'start') {
                        setStartTime(item.value);
                      } else {
                        setEndTime(item.value);
                      }
                      setPickerTarget(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        item.value === selected && styles.modalOptionTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.value === selected && (
                      <Text style={styles.modalOptionCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
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
  card: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  dayList: {
    gap: 8,
  },
  dayRow: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 10,
    padding: 12,
  },
  dayRowActive: {
    backgroundColor: lightColors.surface,
  },
  dayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  dayName: {
    fontSize: 15,
    fontWeight: '600',
    color: lightColors.text,
  },
  dayNameInactive: {
    color: lightColors.textMuted,
  },
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 60,
  },
  timeText: {
    fontSize: 14,
    color: lightColors.textSecondary,
  },
  timeTextInactive: {
    color: lightColors.textMuted,
    fontStyle: 'italic',
  },
  editLink: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.primary,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 60,
    flexWrap: 'wrap',
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: lightColors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 96,
  },
  pickerButtonText: {
    fontSize: 14,
    color: lightColors.text,
    flex: 1,
  },
  pickerChevron: {
    fontSize: 12,
    color: lightColors.textMuted,
    marginLeft: 6,
  },
  timeSeparator: {
    fontSize: 14,
    color: lightColors.textMuted,
  },
  errorText: {
    fontSize: 12,
    color: lightColors.error,
    marginTop: 8,
    marginLeft: 60,
  },
  // Time picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 12,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalOptionSelected: {
    backgroundColor: '#FEE2E2',
  },
  modalOptionText: {
    fontSize: 15,
    color: lightColors.text,
    flex: 1,
  },
  modalOptionTextSelected: {
    fontWeight: '600',
    color: lightColors.primary,
  },
  modalOptionCheck: {
    fontSize: 16,
    color: lightColors.primary,
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: lightColors.textSecondary,
  },
});