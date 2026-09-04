import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';

export interface TimeOption {
  /** Canonical 24-hour zero-padded "HH:MM" value stored in Firestore. */
  value: string;
  /** User-friendly 12-hour AM/PM label, e.g. "9:00 AM". */
  label: string;
}

/**
 * All selectable times in 30-minute increments, from 7:00 AM to 7:00 PM
 * (inclusive). `value` is the canonical 24-hour zero-padded "HH:MM" string
 * stored in Firestore (WorkHoursScheduleDocument.startTime/endTime); `label`
 * is the user-friendly 12-hour AM/PM display.
 */
export const TIME_OPTIONS: TimeOption[] = (() => {
  const options: TimeOption[] = [];
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
export function timeLabel(value: string): string {
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

interface TimePickerDropdownProps {
  /** Currently selected 24-hour "HH:MM" value. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Options to show in the dropdown. Defaults to TIME_OPTIONS
   * (7:00 AM – 7:00 PM in 30-minute increments). Pass a filtered subset to
   * restrict the selectable times.
   */
  options?: TimeOption[];
  /** Title shown inside the dropdown modal. */
  title?: string;
  /** Placeholder shown on the button when `value` is empty. */
  placeholder?: string;
}

/**
 * Dropdown time selector used across the app (Work Hours start/end times and
 * the Book Appointment time picker). Tapping the button opens a modal list of
 * 12-hour AM/PM time options — no keyboard/typing involved.
 */
export function TimePickerDropdown({
  value,
  onChange,
  options = TIME_OPTIONS,
  title = 'Select Time',
  placeholder = 'Select a time',
}: TimePickerDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.pickerButtonText}>{value ? timeLabel(value) : placeholder}</Text>
        <Text style={styles.pickerChevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{title}</Text>
            {options.length === 0 ? (
              <Text style={styles.modalEmptyText}>No times available.</Text>
            ) : (
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => {
                  const selected = item.value === value;
                  return (
                    <TouchableOpacity
                      style={[styles.modalOption, selected && styles.modalOptionSelected]}
                      onPress={() => {
                        onChange(item.value);
                        setOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          selected && styles.modalOptionTextSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                      {selected && (
                        <Text style={styles.modalOptionCheck}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
  modalEmptyText: {
    fontSize: 14,
    color: lightColors.textMuted,
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
});