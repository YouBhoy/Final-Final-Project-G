import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { borderRadius, fontSize, forestColors, spacing } from '@spartan-g/shared-ui';
import { forestNoteService } from '@spartan-g/shared-services';
import { ForestTree } from './ForestTree';
import { formatLongDate, formatTime, type ForestCheckIn } from './forestUtils';
import { SPECIES_LABEL } from './forestLayout';

// ─── TreeDetailSheet ───────────────────────────────────────────────────────
// Bottom sheet shown when a tree is tapped: date, time, place, streak info and
// the existing per-tree note ("name this tree") feature, plus a shortcut to the
// student's results screen. Deliberately free of any score/risk value.

interface TreeDetailSheetProps {
  checkIn: ForestCheckIn | null;
  /** Place label for the check-in (campus label or a neutral fallback). */
  placeName: string;
  /** Used for the note document (forest_notes/{attemptId}). */
  studentId?: string;
  onClose: () => void;
  onViewResults: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function TreeDetailSheet({
  checkIn,
  placeName,
  studentId,
  onClose,
  onViewResults,
}: TreeDetailSheetProps) {
  const [noteText, setNoteText] = useState('');
  const [noteSaved, setNoteSaved] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // The sheet preview never sways — a single static frame is all it needs.
  const staticWind = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!checkIn) return;
    let cancelled = false;
    setNoteText('');
    setNoteSaved('');
    setEditing(false);
    setNoteError(null);
    (async () => {
      const doc = await forestNoteService.getNote(checkIn.attemptId);
      if (cancelled) return;
      const existing = doc && doc.note.trim() ? doc.note.trim() : '';
      setNoteSaved(existing);
      setNoteText(existing);
      setEditing(existing === '');
    })();
    return () => {
      cancelled = true;
    };
  }, [checkIn]);

  const saveNote = useCallback(async () => {
    if (!checkIn || !studentId) return;
    const trimmed = noteText.trim();
    if (trimmed === '' && noteSaved === '') {
      setEditing(true);
      return;
    }
    setSaving(true);
    setNoteError(null);
    const ok = await forestNoteService.saveNote({
      studentId,
      attemptId: checkIn.attemptId,
      note: trimmed,
    });
    setSaving(false);
    if (ok) {
      setNoteSaved(trimmed);
      setEditing(trimmed !== '');
    } else {
      setNoteError('Couldn’t save your note. Try again.');
    }
  }, [checkIn, studentId, noteText, noteSaved]);

  const streakLabel = useMemo(() => {
    if (!checkIn) return '';
    if (checkIn.milestone === 1) return 'Your very first check-in';
    if (checkIn.milestone) return `Milestone — ${checkIn.milestone} check-ins`;
    if (!checkIn.healthy) return 'Streak restarted here';
    if (checkIn.streakDay > 1) return `${checkIn.streakDay} days in a row`;
    return 'Streak of 1 day';
  }, [checkIn]);

  return (
    <Modal
      visible={!!checkIn}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close details" />
      {checkIn && (
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <View style={styles.previewWrap}>
              <ForestTree
                checkIn={checkIn}
                wind={staticWind}
                reducedMotion
                onPress={() => undefined}
                x={0}
                y={0}
                row={0}
                col={0}
                previewHeight={64}
              />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{SPECIES_LABEL[checkIn.species]}</Text>
              <Text style={styles.subtitle}>
                {checkIn.milestone ? 'Milestone tree' : 'Check-in tree'}
              </Text>
            </View>
          </View>

          <Row label="Date" value={formatLongDate(checkIn.date)} />
          <Row label="Time" value={formatTime(checkIn.date)} />
          <Row label="Place" value={placeName} />
          <Row label="Streak" value={streakLabel} />
          <Row label="Check-in" value={checkIn.instrumentsLabel} />
          {checkIn.minutes > 0 && <Row label="Time spent" value={`${checkIn.minutes} min`} />}

          <View style={styles.noteSection}>
            <Text style={styles.noteLabel}>{noteSaved ? 'Tree name / note' : 'Name this tree'}</Text>
            {editing ? (
              <>
                <TextInput
                  style={styles.noteInput}
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="Give this tree a name or note"
                  placeholderTextColor={forestColors.textMuted}
                  maxLength={120}
                  returnKeyType="done"
                />
                {noteError && <Text style={styles.noteError}>{noteError}</Text>}
                <TouchableOpacity
                  onPress={saveNote}
                  style={styles.saveButton}
                  disabled={saving}
                  accessibilityRole="button"
                >
                  <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </>
            ) : noteSaved ? (
              <View style={styles.noteRow}>
                <Text style={styles.noteText}>{noteSaved}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setNoteText(noteSaved);
                    setEditing(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Edit tree note"
                >
                  <Text style={styles.editLink}>Edit</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.noteEmpty}>No name yet.</Text>
            )}
          </View>

          <TouchableOpacity
            onPress={onViewResults}
            style={styles.primaryButton}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>View my results</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button">
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </Modal>
  );
}


const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: forestColors.scrim },
  sheet: {
    backgroundColor: forestColors.bgDeep,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: forestColors.surfaceBorder,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: forestColors.surfaceBorder,
    marginBottom: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewWrap: { width: 64, height: 72, alignItems: 'center', justifyContent: 'flex-end' },
  headerText: { flex: 1 },
  title: { color: forestColors.text, fontSize: fontSize.lg, fontWeight: '700' },
  subtitle: { color: forestColors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: forestColors.surfaceBorder,
  },
  detailLabel: { color: forestColors.textMuted, fontSize: fontSize.sm },
  detailValue: {
    color: forestColors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  noteSection: { marginTop: spacing.sm, gap: spacing.xs },
  noteLabel: { color: forestColors.textSecondary, fontSize: fontSize.xs, fontWeight: '700' },
  noteInput: {
    backgroundColor: forestColors.surface,
    borderRadius: borderRadius.md,
    color: forestColors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  noteError: { color: forestColors.golden, fontSize: fontSize.xs },
  saveButton: {
    alignSelf: 'flex-start',
    backgroundColor: forestColors.chipActive,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  saveButtonText: { color: forestColors.text, fontSize: fontSize.sm, fontWeight: '700' },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noteText: { flex: 1, color: forestColors.text, fontSize: fontSize.sm },
  editLink: { color: forestColors.grassLight, fontSize: fontSize.sm, fontWeight: '700' },
  noteEmpty: { color: forestColors.textMuted, fontSize: fontSize.sm },
  primaryButton: {
    marginTop: spacing.md,
    backgroundColor: forestColors.chipActive,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: { color: forestColors.text, fontSize: fontSize.sm, fontWeight: '700' },
  closeButton: { paddingVertical: spacing.sm, alignItems: 'center' },
  closeButtonText: { color: forestColors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
});

