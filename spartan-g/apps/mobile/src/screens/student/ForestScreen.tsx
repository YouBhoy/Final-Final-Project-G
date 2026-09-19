import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import type { AssessmentDefinitionDocument } from '@spartan-g/shared-types';
import { useAuthStore, assessmentService, forestNoteService } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';
import { ForestTree, type ForestPalette, type ForestSpecies } from './components/ForestTree';

// ─── Forest Screen (v1) ───────────────────────────────────────────────────
// A garden-of-trees history of the student's submitted/graded check-ins.
//
// Appearance of each tree is driven ONLY by neutral attributes:
//   • species   — which instrument(s) the attempt contained
//   • size      — answered ÷ total questions (same ratio as the leaf tree)
//   • palette   — calendar month the attempt was submitted
//
// NO score / severity / risk value is read or referenced anywhere in this
// feature. Every tree is visually "healthy" regardless of how it scored.

type ForestTreeData = {
  attemptId: string;
  date: Date;
  species: ForestSpecies;
  growRatio: number;
  palette: ForestPalette;
  instrumentsLabel: string;
  message: string;
};

type ForestRow =
  | { kind: 'milestone'; key: string; milestoneLabel: string }
  | { kind: 'tree'; key: string; tree: ForestTreeData; offsetX: number; label: string };

// Deterministic path offset — same index always yields the same sway, mirroring
// the leaf-position principle in GardenTree: no visual shuffling between visits.
function pathOffsetX(index: number): number {
  const amplitude = 36;
  return Math.round(Math.sin(index * 1.9) * amplitude);
}

// Milestones at the 1st check-in and then every 5th (1, 5, 10, 15, …).
function isMilestone(count: number): boolean {
  return count === 1 || count % 5 === 0;
}

function milestoneLabel(count: number): string {
  const name = count === 1 ? '1st' : `${count}th`;
  return `${name} check-in`;
}

// Rotating pool of encouraging messages (deterministic by position).
const ENCOURAGEMENT_POOL = [
  'You showed up for yourself that day.',
  'Every check-in shapes your forest.',
  'Taking time to notice is a strength.',
  'One step at a time grows a whole grove.',
  'You cared enough to pause and check in.',
  'Growth is quiet, but it’s happening.',
];

function pickMessage(index: number): string {
  return ENCOURAGEMENT_POOL[index % ENCOURAGEMENT_POOL.length];
}

// Neutral month palettes (color is tied to the submission month only).
const MONTH_PALETTES: ForestPalette[] = [
  { trunk: '#78350F', canopy: '#16A34A', accent: '#86EFAC' }, // Jan
  { trunk: '#134E4A', canopy: '#0D9488', accent: '#99F6E4' }, // Feb
  { trunk: '#365314', canopy: '#65A30D', accent: '#D9F99D' }, // Mar
  { trunk: '#1E3A8A', canopy: '#3B82F6', accent: '#BFDBFE' }, // Apr
  { trunk: '#14532D', canopy: '#22C55E', accent: '#BBF7D0' }, // May
  { trunk: '#3F6212', canopy: '#84CC16', accent: '#ECFCCB' }, // Jun
  { trunk: '#422006', canopy: '#CA8A04', accent: '#FEF08A' }, // Jul
  { trunk: '#78350F', canopy: '#EA580C', accent: '#FED7AA' }, // Aug
  { trunk: '#7C2D12', canopy: '#C2410C', accent: '#FDBA74' }, // Sep
  { trunk: '#92400E', canopy: '#EAB308', accent: '#FEF3C7' }, // Oct
  { trunk: '#3B0764', canopy: '#7C3AED', accent: '#DDD6FE' }, // Nov
  { trunk: '#064E3B', canopy: '#059669', accent: '#A7F3D0' }, // Dec
];

function monthPalette(month: number): ForestPalette {
  return MONTH_PALETTES[Math.max(0, Math.min(month, 11)) % MONTH_PALETTES.length];
}

// Determines which instrument(s) an attempt's assessment contained by reading
// the question-ID prefixes ONLY. Neutral — never touches a score/severity field.
function detectInstruments(def: AssessmentDefinitionDocument & { id: string }): string[] {
  const ids = (def.questions ?? [])
    .map((q) => (q.id || '').toLowerCase());
  const has = (prefix: string) => ids.some((id) => id.startsWith(prefix));
  const found: string[] = [];
  if (has('phq')) found.push('PHQ-9');
  if (has('gad')) found.push('GAD-7');
  if (has('dass')) found.push('DASS-21');
  return found;
}

function deriveSpecies(instruments: string[]): ForestSpecies {
  if (instruments.length >= 2) return 'combined';
  const kind = instruments[0];
  if (kind === 'PHQ-9') return 'phq';
  if (kind === 'GAD-7') return 'gad';
  if (kind === 'DASS-21') return 'dass';
  return 'combined'; // unknown/mixed → broad canopy
}

function toDate(ts: unknown): Date {
  const source = ts as {
    toDate?: () => Date;
    toMillis?: () => number;
  } | null;
  try {
    if (source?.toDate && typeof source.toDate === 'function') return source.toDate();
    if (source?.toMillis && typeof source.toMillis === 'function') return new Date(source.toMillis());
    if (typeof ts === 'string') return new Date(ts);
    if (ts instanceof Date) return ts;
  } catch {
    /* fall through */
  }
  return new Date();
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const EMPTY_PALETTE: ForestPalette = { trunk: '#78350F', canopy: '#4ADE80', accent: '#BBF7D0' };
export function ForestScreen() {
  const session = useAuthStore((s) => s.session);
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ForestRow[]>([]);
  const [selected, setSelected] = useState<ForestTreeData | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const all = await assessmentService.getAttemptsByStudent(session.uid);

      // Submitted/graded attempts only — oldest → newest.
      const attempts = [...all].sort(
        (a, b) => toDate(a.submittedAt).getTime() - toDate(b.submittedAt).getTime(),
      );

      // Fetch each assessment definition once (cache by id) so we can read the
      // neutral question set (instrument presence + total question count).
      const defMap = new Map<string, AssessmentDefinitionDocument & { id: string }>();
      for (const attempt of attempts) {
        if (!defMap.has(attempt.assessmentId)) {
          const def = await assessmentService.getAssessmentDefinition(attempt.assessmentId);
          if (def) defMap.set(attempt.assessmentId, def);
        }
      }

      const trees: ForestTreeData[] = attempts.map((attempt, index) => {
        const def = defMap.get(attempt.assessmentId);
        const instruments = def ? detectInstruments(def) : [];
        const totalQuestions = Math.max(def?.questions?.length ?? 0, 1);

        // Same ratio the per-question leaf tree uses: answered ÷ total.
        const answered = attempt.answers.filter(
          (a) => a.value !== undefined && a.value !== '',
        ).length;
        const growRatio = Math.min(1, answered / totalQuestions);

        const date = toDate(attempt.submittedAt);
        const instrumentsLabel =
          instruments.length === 0 ? 'Standard check-in' : instruments.join(' + ');

        return {
          attemptId: attempt.id,
          date,
          species: deriveSpecies(instruments),
          growRatio,
          palette: monthPalette(date.getMonth()),
          instrumentsLabel,
          message: pickMessage(index),
        };
      });

      const next: ForestRow[] = [];
      trees.forEach((tree, index) => {
        const count = index + 1;
        if (isMilestone(count)) {
          next.push({
            kind: 'milestone',
            key: `milestone-${count}`,
            milestoneLabel: milestoneLabel(count),
          });
        }
        next.push({
          kind: 'tree',
          key: tree.attemptId,
          tree,
          offsetX: pathOffsetX(index),
          label: formatShortDate(tree.date),
        });
      });

      setRows(next);
      setError(null);
    } catch {
      setError('Unable to load your forest. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Load on mount and whenever the Forest screen regains focus (mirrors the
  // Garden's "Current Assessment Progress" pattern).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const closeDetails = useCallback(() => setSelected(null), []);
  const viewResults = useCallback(() => {
    setSelected(null);
    // Reuse the student's existing assessments screen — no score logic here.
    navigation.navigate('StudentTabs', { screen: 'StudentAssignments' });
  }, [navigation]);

  // ─── Tree note (forest_notes/{attemptId}, self-owned) ──────
  const [noteText, setNoteText] = useState('');
  const [noteSaved, setNoteSaved] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Load any existing note whenever a tree is opened in the detail modal.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setNoteText('');
    setNoteSaved('');
    setEditingNote(false);
    setNoteError(null);
    (async () => {
      const doc = await forestNoteService.getNote(selected.attemptId);
      if (cancelled) return;
      const existing = doc && doc.note.trim() ? doc.note.trim() : '';
      setNoteSaved(existing);
      setNoteText(existing);
      setEditingNote(existing === ''); // no note → show the input to add one
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleSaveNote = useCallback(async () => {
    if (!selected || !session) return;
    const trimmed = noteText.trim();
    // Avoid creating an empty note out of thin air.
    if (trimmed === '' && noteSaved === '') {
      setEditingNote(true);
      return;
    }
    setSavingNote(true);
    setNoteError(null);
    const ok = await forestNoteService.saveNote({
      studentId: session.uid,
      attemptId: selected.attemptId,
      note: trimmed,
    });
    setSavingNote(false);
    if (ok) {
      setNoteSaved(trimmed);
      setEditingNote(trimmed !== '');
    } else {
      setNoteError('Couldn’t save your note. Try again.');
    }
  }, [selected, session, noteText, noteSaved]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Growing your forest…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Unable to Load Forest</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <ForestTree species="sapling" growRatio={0.15} palette={EMPTY_PALETTE} />
        <Text style={styles.emptyTitle}>Your forest is waiting</Text>
        <Text style={styles.emptyText}>Complete your first check-in to plant your first tree.</Text>
      </View>
    );
  }
return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>My Forest</Text>
      <Text style={styles.subtitle}>Every check-in grows a tree — no two are alike.</Text>

      {rows.map((row) =>
        row.kind === 'milestone' ? (
          <View key={row.key} style={styles.milestoneRow}>
            <View style={styles.milestoneFlag}>
              <Text style={styles.milestoneFlagText}>📍</Text>
            </View>
            <Text style={styles.milestoneText}>{row.milestoneLabel}</Text>
          </View>
        ) : (
          <View key={row.key} style={styles.treeRow}>
            <View style={[styles.treeCell, { transform: [{ translateX: row.offsetX }] }]}>
              <Pressable
                onPress={() => setSelected(row.tree)}
                style={({ pressed }) => [styles.treePressable, pressed && styles.treePressed]}
                accessibilityRole="button"
                accessibilityLabel={`Check-in tree, ${row.label}`}
              >
                <ForestTree
                  species={row.tree.species}
                  growRatio={row.tree.growRatio}
                  palette={row.tree.palette}
                />
              </Pressable>
            </View>
            <Text style={styles.treeDate}>{row.label}</Text>
          </View>
        ),
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={closeDetails}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Check-in tree</Text>
            {selected && (
              <>
                <Text style={styles.modalDate}>Completed {formatLongDate(selected.date)}</Text>
                <Text style={styles.modalInstruments}>
                  Instruments: {selected.instrumentsLabel}
                </Text>
                <View style={styles.modalDivider} />
                <Text style={styles.modalMessage}>“{selected.message}”</Text>

                <View style={styles.noteSection}>
                  <Text style={styles.noteLabel}>
                    {noteSaved ? 'Tree name / note' : 'Name this tree'}
                  </Text>

                  {editingNote ? (
                    <>
                      <TextInput
                        style={styles.noteInput}
                        value={noteText}
                        onChangeText={setNoteText}
                        placeholder="Give this tree a name or note"
                        placeholderTextColor={lightColors.textMuted}
                        maxLength={120}
                        returnKeyType="done"
                      />
                      {noteError && <Text style={styles.noteErrorText}>{noteError}</Text>}
                      <TouchableOpacity
                        onPress={handleSaveNote}
                        style={styles.noteSaveButton}
                        disabled={savingNote}
                      >
                        <Text style={styles.noteSaveText}>
                          {savingNote ? 'Saving…' : 'Save'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : noteSaved ? (
                    <View style={styles.noteSavedRow}>
                      <Text style={styles.noteText}>{noteSaved}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setNoteText(noteSaved);
                          setEditingNote(true);
                        }}
                        style={styles.noteEditLink}
                      >
                        <Text style={styles.noteEditText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.noteEmpty}>No name yet.</Text>
                  )}
                </View>

                <TouchableOpacity onPress={viewResults} style={styles.resultsButton}>
                  <Text style={styles.resultsButtonText}>View my results</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={closeDetails} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    alignItems: 'center',
  },
  center: {
    flex: 1,
    backgroundColor: lightColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 8,
  },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconText: {
    fontSize: 28,
    fontWeight: '700',
    color: lightColors.error,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: lightColors.text,
    alignSelf: 'flex-start',
  },
  subtitle: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 4,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginVertical: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: lightColors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: lightColors.border,
    gap: 8,
  },
  milestoneFlag: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: lightColors.warningBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneFlagText: {
    fontSize: 15,
  },
  milestoneText: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.text,
  },
  treeRow: {
    alignItems: 'center',
    marginVertical: 6,
  },
  treeCell: {
    width: 130,
    alignItems: 'center',
  },
  treePressable: {
    alignItems: 'center',
  },
  treePressed: {
    opacity: 0.7,
  },
  treeDate: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  modalDate: {
    fontSize: 14,
    color: lightColors.textSecondary,
    alignSelf: 'flex-start',
  },
  modalInstruments: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.text,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  modalDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: lightColors.border,
    marginVertical: 16,
  },
  modalMessage: {
    fontSize: 15,
    color: lightColors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  noteSection: {
    alignSelf: 'stretch',
    backgroundColor: lightColors.neutralBackground,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  noteLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 6,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    backgroundColor: lightColors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: lightColors.text,
  },
  noteErrorText: {
    fontSize: 12,
    color: lightColors.error,
    marginTop: 6,
  },
  noteSaveButton: {
    marginTop: 8,
    alignSelf: 'flex-end',
    backgroundColor: lightColors.primary,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noteSavedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    color: lightColors.text,
    lineHeight: 20,
  },
  noteEditLink: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  noteEditText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.primary,
  },
  noteEmpty: {
    fontSize: 13,
    color: lightColors.textMuted,
  },
  resultsButton: {
    alignSelf: 'stretch',
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    alignSelf: 'stretch',
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.textSecondary,
  },
});