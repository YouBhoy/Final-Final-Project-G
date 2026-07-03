import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore, workHoursService } from '@spartan-g/shared-services';
import type { WorkHoursScheduleDocument } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function WorkHoursScreen() {
  const session = useAuthStore((s) => s.session);

  const [schedules, setSchedules] = useState<(WorkHoursScheduleDocument & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);

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
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.timeInput}
                      value={startTime}
                      onChangeText={setStartTime}
                      placeholder="09:00"
                      placeholderTextColor={lightColors.textMuted}
                      autoComplete="off"
                    />
                    <Text style={styles.timeSeparator}>to</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={endTime}
                      onChangeText={setEndTime}
                      placeholder="17:00"
                      placeholderTextColor={lightColors.textMuted}
                      autoComplete="off"
                    />
                    <TouchableOpacity
                      onPress={() => handleSaveTime(index)}
                      disabled={saving}
                      style={[styles.saveButton, saving && styles.saveButtonDisabled]}
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
                ) : (
                  <View style={styles.timeDisplay}>
                    <Text style={[styles.timeText, !isActive && styles.timeTextInactive]}>
                      {isActive ? `${schedule?.startTime || '09:00'} - ${schedule?.endTime || '17:00'}` : 'Inactive'}
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
  timeInput: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: lightColors.text,
    backgroundColor: lightColors.background,
    width: 70,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: 14,
    color: lightColors.textMuted,
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