import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList, AssessmentDefinitionDocument, AssessmentAttemptDocument } from '@spartan-g/shared-types';
import { assessmentRepository, assessmentService, useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';
import { StudentPageHeader, StudentPageBackground, StudentSearchField, StudentPageNotice, StudentTag, studentPageColors as colors } from '../../components/StudentPageDesign';
import { assessmentListStatus, assessmentListFilters, filterAssessmentList, type AssessmentListFilter, type AssessmentListStatus } from '../student/student-list-models';

type AssessmentDefWithId = AssessmentDefinitionDocument & { id: string };

export function AssessmentsListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const session = useAuthStore(s => s.session);
  const [assessments, setAssessments] = useState<AssessmentDefWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentDefWithId | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AssessmentListFilter>('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [guidanceVisible, setGuidanceVisible] = useState(true);
  const [statuses, setStatuses] = useState<{ uid: string; values: Record<string, AssessmentListStatus> } | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [history,setHistory]=useState<{owner:typeof session;rows:(AssessmentAttemptDocument&{id:string})[]}|null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const statusRequest = useRef(0);
  useEffect(() => {
    setLoading(true);
    setError(null);

    // Use real-time listener (onSnapshot) matching web's approach
    const unsubscribe = assessmentRepository.subscribePublished(
      (data) => {
        setAssessments(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message || 'Failed to load assessments');
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [refreshKey]);


  // Existing owner-scoped read-only services; scoring and attempt creation are untouched.
  useFocusEffect(useCallback(() => {
    const request = ++statusRequest.current;
    setStatuses(null);
    setHistory(null);
    setStatusError(false);
    if (!session || session.role !== 'student') return;
    const uid = session.uid;
    Promise.all([
      assessmentService.getInProgressAttemptsByStudent(uid),
      assessmentService.getAttemptsByStudent(uid),
    ]).then(([inProgress, submitted]) => {
      if (request !== statusRequest.current || useAuthStore.getState().session!==session) return;
      const attempts = [...inProgress, ...submitted];
      const values = Object.fromEntries(assessments.map(a => [a.id, assessmentListStatus(a.id, uid, attempts)]));
      setStatuses({ uid, values });
      setHistory({owner:session,rows:submitted});
    }).catch(() => {
      if (request === statusRequest.current) { setStatusError(true); setFilter('All'); }
    });
    return () => { statusRequest.current++; };
  }, [session?.uid, session?.role, assessments, loading, error, refreshKey]));

  const ownStatuses = statuses?.uid === session?.uid ? statuses?.values : undefined;
  const visibleAssessments = filterAssessmentList(assessments, search, ownStatuses ? filter : 'All', ownStatuses ?? {});
  const retry = () => { setLoading(true); setRefreshKey(value => value + 1); };
  const handleStart = useCallback(async () => {
    if (!selectedAssessment || !session) return;

    setStarting(true);
    setStartError(null);

    try {
      // Phase 3B: start an attempt on the assessment definition
      const attemptId = await assessmentService.startAttempt(
        selectedAssessment.id,
        session.uid,
      );
      setSelectedAssessment(null);
      // Navigate to the assessment-taking screen with the attempt ID
      navigation.navigate('AssessmentWizard', { assessmentId: attemptId });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start assessment');
    } finally {
      setStarting(false);
    }
  }, [selectedAssessment, session, navigation]);


  return (
    <View style={styles.container}>
      <StudentPageBackground />
      <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={retry} tintColor={colors.red} colors={[colors.red]} />}>
        <StudentPageHeader title="Assessments" subtitle="Check-in questionnaires published by your facilitators." />
        <View style={styles.body}>
          <View style={styles.controls}>
            <StudentSearchField value={search} onChangeText={setSearch} placeholder="Search assessments..." label="Search assessments" />
            <TouchableOpacity testID="assessment-filter" style={styles.filterButton} onPress={() => setFilterOpen(true)} accessibilityRole="button" accessibilityLabel={'Filter assessments: ' + (ownStatuses ? filter : 'All')} accessibilityState={{ expanded: filterOpen }}>
              <Text style={styles.filterText}>{ownStatuses ? filter : 'All'}</Text><Feather name="chevron-down" size={15} color={colors.crimson} />
            </TouchableOpacity>
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Available Assessments</Text>
            {!loading && !error && <Text style={styles.count}>{visibleAssessments.length} {visibleAssessments.length === 1 ? 'assessment' : 'assessments'}</Text>}
          </View>
          <TouchableOpacity testID="open-assessment-history" accessibilityRole="button" onPress={()=>setHistoryOpen(true)} style={styles.filterButton}><Feather name="clock" size={17} color={colors.crimson}/><Text style={styles.filterText}>Assessment History</Text></TouchableOpacity>
          {statusError && <Text style={styles.statusNotice} accessibilityLiveRegion="polite">Your attempt statuses are unavailable. Published questionnaires are still shown. Pull down to retry.</Text>}
          {loading ? <StudentPageNotice title="Loading assessments..." loading /> : error ? <StudentPageNotice title="Unable to load assessments" message="Check your connection and access, then try again." onRetry={retry} /> : visibleAssessments.length === 0 ? (
            <StudentPageNotice title={assessments.length ? 'No matching assessments' : 'No assessments available'} message={assessments.length ? 'Try another search or choose All.' : 'New check-ins will appear here when your facilitators publish them.'} />
          ) : <View style={styles.list}>{visibleAssessments.map(a => (
            <TouchableOpacity key={a.id} testID={'assessment-card-' + a.id} style={styles.templateCard} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={'View details: ' + a.title}
              onPress={() => { setStartError(null); setSelectedAssessment(a); }}>
              <View style={styles.cardMain}>
                <View style={styles.documentTile}><Feather name="file-text" size={28} color={colors.accent} /></View>
                <View style={styles.cardCopy}>
                  <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{Array.isArray(a.questions) ? a.questions.length + ' questions' : 'Questionnaire'}</Text></View>
                  <Text style={styles.templateTitle}>{a.title}</Text>
                  {!!a.description && <Text style={styles.templateDescription}>{a.description}</Text>}
                </View>
                <View style={styles.cardArrow}><Feather name="chevron-right" size={19} color={colors.red} /></View>
              </View>
              <View style={styles.templateFooter}>
                <StudentTag icon="heart">Questionnaire</StudentTag>
                {typeof a.timeLimitMinutes === 'number' && a.timeLimitMinutes > 0 && <StudentTag icon="clock">{a.timeLimitMinutes} min limit</StudentTag>}
                <StudentTag icon="clipboard">{ownStatuses?.[a.id] ?? 'Published'}</StudentTag>
              </View>
            </TouchableOpacity>
          ))}</View>}
          {guidanceVisible && <View style={styles.guidance}>
            <View style={styles.bulb}><Feather name="sun" size={27} color="#B86008" /></View>
            <View style={styles.guidanceCopy}><Text style={styles.guidanceTitle}>Your Well-being Matters</Text><Text style={styles.guidanceText}>Be honest with your responses. This helps your facilitators provide better support.</Text></View>
            <TouchableOpacity style={styles.dismissGuidance} accessibilityRole="button" accessibilityLabel="Dismiss wellness guidance" onPress={() => setGuidanceVisible(false)}><Feather name="x" size={16} color={colors.slate} /></TouchableOpacity>
          </View>}
        </View>
      </ScrollView>
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setFilterOpen(false)} accessibilityRole="button" accessibilityLabel="Close assessment filter" />
          <View style={styles.modalContent} accessibilityViewIsModal>
            <Text style={styles.modalTitle}>Show assessments</Text>
            <Text style={styles.templateDescription}>Published questionnaires, filtered by your own attempt records.</Text>
            {assessmentListFilters.map(option => <TouchableOpacity key={option} testID={'filter-' + option} style={styles.filterOption} accessibilityRole="radio" accessibilityState={{ checked: filter === option, disabled: option !== 'All' && !ownStatuses }} disabled={option !== 'All' && !ownStatuses} onPress={() => { setFilter(option); setFilterOpen(false); }}>
              <Text style={[styles.filterText, option !== 'All' && !ownStatuses && styles.disabledFilter]}>{option}</Text>{filter === option && <Feather name="check" color={colors.red} size={20} />}
            </TouchableOpacity>)}
            {!ownStatuses && <Text style={styles.templateDescription}>{statusError ? 'Attempt statuses could not be loaded.' : 'Loading your attempt statuses...'}</Text>}
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => setFilterOpen(false)} accessibilityRole="button"><Text style={styles.modalCancelText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={historyOpen&&!!session} transparent animationType="fade" onRequestClose={()=>setHistoryOpen(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalContent} accessibilityViewIsModal>
          <Text style={styles.modalTitle}>Assessment History</Text>
          <ScrollView style={{maxHeight:380}}>
            {statusError?<Text accessibilityRole="alert" style={styles.statusNotice}>History could not be loaded. Close this view and pull down to retry.</Text>:history?.owner!==session?<ActivityIndicator color={colors.crimson}/>:history.rows.length===0?<Text style={styles.templateDescription}>No submitted check-ins yet.</Text>:history.rows.map(row=><View key={row.id} style={styles.filterOption}><View style={{flex:1}}><Text style={styles.templateTitle}>{assessments.find(a=>a.id===row.assessmentId)?.title??'Wellness check-in'}</Text><Text style={styles.templateDescription}>{row.submittedAt?.toDate?.().toLocaleString()??'Date unavailable'} · Attempt {row.attemptNumber}</Text><Text style={styles.templateDescription}>{row.status==='graded'?'Reviewed':'Submitted'} · {row.answers.length} answers saved</Text></View></View>)}
          </ScrollView>
          <TouchableOpacity accessibilityRole="button" onPress={()=>setHistoryOpen(false)} style={styles.modalCancelButton}><Text style={styles.modalCancelText}>Close</Text></TouchableOpacity>
        </View></View>
      </Modal>
      {/* Detail Modal */}
      <Modal
        visible={!!selectedAssessment}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAssessment(null)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.modalContent}>
            {selectedAssessment && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalCategoryBadge}>
                    <Text style={styles.modalCategoryBadgeText}>
                      {Array.isArray(selectedAssessment.questions) ? selectedAssessment.questions.length + ' questions' : 'Questionnaire'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.modalTitle}>{selectedAssessment.title}</Text>

                {selectedAssessment.description && (
                  <Text style={styles.modalDescription}>{selectedAssessment.description}</Text>
                )}

                {selectedAssessment.instructions && (
                  <View style={styles.instructionsBox}>
                    <Text style={styles.instructionsLabel}>Instructions</Text>
                    <Text style={styles.instructionsText}>{selectedAssessment.instructions}</Text>
                  </View>
                )}

                {startError && (
                  <View style={styles.modalError}>
                    <Text style={styles.modalErrorText}>{startError}</Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={() => setSelectedAssessment(null)}
                    style={styles.modalCancelButton}
                    disabled={starting}
                  >
                    <Text style={styles.modalCancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleStart}
                    accessibilityRole="button"
                    accessibilityLabel="Start assessment"
                    style={[styles.modalStartButton, starting && styles.modalStartButtonDisabled]}
                    disabled={starting}
                    activeOpacity={0.8}
                  >
                    {starting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalStartText}>Start assessment</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contentContainer: { flexGrow: 1, paddingBottom: 112 },
  body: { paddingHorizontal: 18, marginTop: -22, gap: 16 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  filterButton: { minHeight: 48, maxWidth: '42%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 24, paddingHorizontal: 13, backgroundColor: '#FFE7EC' },
  filterText: { color: colors.crimson, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  disabledFilter: { opacity: 0.5 },
  filterOption: { minHeight: 52, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, justifyContent: 'space-between', marginTop: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  count: { fontSize: 12, color: colors.slate },
  statusNotice: { fontSize: 13, color: colors.slate, lineHeight: 19 },
  list: { gap: 14 },
  templateCard: { backgroundColor: 'rgba(255,255,255,0.97)', borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 23, padding: 15, shadowColor: '#991B1B', shadowOpacity: 0.045, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 2 },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  documentTile: { width: 50, height: 57, borderRadius: 15, backgroundColor: '#FFDDE4', justifyContent: 'center', alignItems: 'center' },
  cardCopy: { flex: 1, minWidth: 0 },
  categoryBadge: { alignSelf: 'flex-start', backgroundColor: '#F1EAFE', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 7 },
  categoryBadgeText: { fontSize: 11, fontWeight: '600', color: '#5B3DA6' },
  templateTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.ink, marginBottom: 5 },
  templateDescription: { fontSize: 13, lineHeight: 19, color: colors.slate },
  cardArrow: { alignSelf: 'center', width: 26, height: 30, borderRadius: 15, backgroundColor: '#FFF3F4', alignItems: 'center', justifyContent: 'center' },
  templateFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  guidance: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 20, backgroundColor: '#FCEAE4', padding: 14, paddingRight: 42 },
  bulb: { width: 38, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0D5' },
  guidanceCopy: { flex: 1, minWidth: 0 },
  guidanceTitle: { fontSize: 13, fontWeight: '700', color: colors.crimson, marginBottom: 5 },
  guidanceText: { fontSize: 12, lineHeight: 18, color: colors.slate },
  dismissGuidance: { position: 'absolute', right: 0, top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detailScroll: { width: '100%', maxWidth: 420, maxHeight: '86%', flexGrow: 0, borderRadius: 22 },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalCategoryBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modalCategoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
  },
  modalQuestionCount: {
    fontSize: 12,
    color: lightColors.textSecondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: lightColors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  instructionsBox: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  instructionsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 13,
    color: '#3730A3',
    lineHeight: 18,
  },
  modalError: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  modalErrorText: {
    fontSize: 13,
    color: '#B91C1C',
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelButton: {
    borderWidth: 1.5,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.textSecondary,
  },
  modalStartButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalStartButtonDisabled: {
    opacity: 0.6,
  },
  modalStartText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
