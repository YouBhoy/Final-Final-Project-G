import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import type {
  AssessmentDefinitionDocument,
  StudentMobileStackParamList,
} from '@spartan-g/shared-types';
import { CAMPUS_SHORT_LABELS } from '@spartan-g/shared-types';
import { assessmentService, useAuthStore } from '@spartan-g/shared-services';
import { borderRadius, fontSize, forestColors, spacing } from '@spartan-g/shared-ui';
import { ActivityChart } from './components/forest/ActivityChart';
import { ForestCanvas } from './components/forest/ForestCanvas';
import { ForestIsland } from './components/forest/ForestIsland';
import { ForestSkeleton } from './components/forest/ForestSkeleton';
import { ForestStats } from './components/forest/ForestStats';
import { MilestoneToast } from './components/forest/MilestoneToast';
import { PeriodTabs } from './components/forest/PeriodTabs';
import { TreeDetailSheet } from './components/forest/TreeDetailSheet';
import {
  FOREST_PREVIEW_OPTIONS,
  previewFor,
  type ForestPreviewKey,
} from './components/forest/forestMocks';
import {
  buildForestCheckIns,
  chartBuckets,
  gridForCount,
  MILESTONE_COUNTS,
  milestoneLabel,
  periodRange,
  shiftPeriod,
  type AttemptWithDef,
  type ChartBucket,
  type ForestCheckIn,
  type PeriodMode,
} from './components/forest/forestUtils';

// ─── My Forest (isometric redesign) ────────────────────────────────────────
// The student's check-in history as a floating isometric island: one tree per
// check-in, placed on a deterministic tile, drawn from plain Views (no image
// assets, no SVG dependency).
//
// Everything visual is seeded by the check-in id (forestUtils.rngFor), so a
// check-in always produces the same species, size, colour and tile — and the
// assignment is derived ONLY from neutral data: submission date, instrument
// question ids, answered count and the day-gap between check-ins. No score,
// severity band or risk value is read anywhere in this feature.
//
//   species   pine / bush / bloom  ← seeded by attempt id (+ streak breaks → bare)
//   size      growRatio + seeded jitter
//   tile      spiral from the island centre, so the forest fills naturally
//   milestone 1st / 10th / 50th check-in → golden tree + toast

/** Root screens show their own dark top bar, so the navigator header is off. */
export function ForestScreen() {  const session = useAuthStore((s) => s.session);
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const { width: windowWidth } = useWindowDimensions();

  // ─── Data ────────────────────────────────────────────────────────────────
  const [checkIns, setCheckIns] = useState<ForestCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Period / selection / motion ─────────────────────────────────────────
  const [mode, setMode] = useState<PeriodMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<ForestCheckIn | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  // ─── Milestone + grow feedback (real data only) ────────────────────────────
  // Toast + grow animation fire once per new milestone check-in (per session),
  // guarding on the specific check-in so period switching never replays them.
  const [toast, setToast] = useState<{ key: string; title: string; message: string } | null>(null);
  const [animateInId, setAnimateInId] = useState<string | null>(null);
  const prevRealCount = useRef(0);

  // ─── Share + preview tooling ─────────────────────────────────────────────
  const islandCaptureRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewKey, setPreviewKey] = useState<ForestPreviewKey>('real');
  const [showPreviewMenu, setShowPreviewMenu] = useState(false);

  const range = useMemo(() => periodRange(mode, anchor), [mode, anchor]);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!session) return;
      if (!options?.silent) setLoading(true);
      try {
        const all = await assessmentService.getAttemptsByStudent(session.uid);

        // Fetch each assessment definition once (cached by id) so we can read
        // the neutral question set — instrument presence + question count.
        const defCache = new Map<string, AssessmentDefinitionDocument & { id: string }>();
        for (const attempt of all) {
          if (!defCache.has(attempt.assessmentId)) {
            const def = await assessmentService.getAssessmentDefinition(attempt.assessmentId);
            if (def) defCache.set(attempt.assessmentId, def);
          }
        }

        const entries: AttemptWithDef[] = all.map((attempt) => ({
          attempt,
          def: defCache.get(attempt.assessmentId) ?? null,
        }));

        setCheckIns(buildForestCheckIns(entries));
        setError(null);
      } catch {
        setError('Unable to load your forest. Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session],
  );

  // Reload on mount and whenever the screen regains focus (matches Garden).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load({ silent: true });
  }, [load]);

  // ─── Accessibility: honour the OS "reduce motion" setting ───────────────
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReducedMotion(enabled);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) =>
      setReducedMotion(enabled),
    );
    return () => {
      cancelled = true;
      sub.remove();
      if (shareTimer.current) clearTimeout(shareTimer.current);
    };
  }, []);

  // ─── Preview mode (dev/mock data) ───────────────────────────────────────
  // 'real' shows live Firestore data; the other keys build synthetic check-ins
  // through the SAME pipeline so 0 / 1 / 12 / 50+ tree states can be reviewed.
  const previewCheckIns: ForestCheckIn[] = useMemo(
    () => (previewKey === 'real' ? checkIns : previewFor(previewKey)),
    [previewKey, checkIns],
  );
  const isPreview = previewKey !== 'real';

  // ─── Derived: period slice, stats, chart, placement ─────────────────────
  const periodCheckIns = useMemo(() => {
    const start = range.start.getTime();
    const end = range.end.getTime();
    return previewCheckIns.filter((c) => c.date.getTime() >= start && c.date.getTime() < end);
  }, [previewCheckIns, range]);

  /** Newest first — the forest grows from the newest trees outward. */
  const placedTrees = useMemo(
    () => [...periodCheckIns].sort((a, b) => b.index - a.index),
    [periodCheckIns],
  );

  const buckets = useMemo(
    () => chartBuckets(mode, range, previewCheckIns),
    [mode, range, previewCheckIns],
  );

  const minutes = useMemo(
    () => periodCheckIns.reduce((sum, c) => sum + c.minutes, 0),
    [periodCheckIns],
  );
  const healthyTrees = useMemo(
    () => periodCheckIns.filter((c) => c.healthy).length,
    [periodCheckIns],
  );
  const witheredTrees = periodCheckIns.length - healthyTrees;
  const currentStreak = useMemo(
    () => (previewCheckIns.length === 0 ? 0 : previewCheckIns[previewCheckIns.length - 1].streakDay),
    [previewCheckIns],
  );

  const latestMilestone = useMemo(() => {
    const milestones = previewCheckIns.filter((c) => c.milestone !== null);
    return milestones.length === 0 ? null : milestones[milestones.length - 1];
  }, [previewCheckIns]);

  // Toast + grow animation fire once per milestone COUNT (per session): on
  // arrival the reached milestone toasts once; while focused, a newly-added
  // milestone check-in additionally plays the grow animation.
  const celebratedRef = useRef<number | null>(null);
  useEffect(() => {
    if (isPreview || loading) return;
    if (latestMilestone === null || latestMilestone.milestone === null) return;
    const count = latestMilestone.milestone;
    if (celebratedRef.current === count) return;
    celebratedRef.current = count;
    // Grow animation only when the milestone check-in itself just arrived.
    if (latestMilestone.index === checkIns.length - 1 && prevRealCount.current > 0) {
      setAnimateInId(latestMilestone.attemptId);
    }
    setToast({
      key: `milestone-${count}`,
      title: `${milestoneLabel(count)}!`,
      message: 'A golden tree joined your forest — keep growing.',
    });
  }, [latestMilestone, checkIns.length, isPreview, loading]);

  // Track the real count so a newly-arriving milestone can be told apart from
  // history that was already there on arrival.
  useEffect(() => {
    if (!isPreview) prevRealCount.current = checkIns.length;
  }, [checkIns.length, isPreview]);

  const hideToast = useCallback(() => setToast(null), []);

  const placeName =
    session?.campus && CAMPUS_SHORT_LABELS[session.campus]
      ? CAMPUS_SHORT_LABELS[session.campus]
      : 'Not recorded';

  // ─── Milestone reaction (real data only) ─────────────────────────────────
  // On arrival, show the badge/toast once for the currently-reached milestone
  // (the toast state is keyed by count, so the message survives until hidden).
  // While focused, a newly-added check-in that hits a milestone plays the grow
  // animation and shows the toast.

  // ─── Island / stats / chart ──────────────────────────────────────────────
  // The island renders ONLY the selected period's trees (the same `periodCheckIns`
  // set the stats/text use), so an empty period shows an empty plot and the
  // header/hint can never contradict the island.

  // The island viewport stays capped on large phones so the stats + chart
  // remain visible without scrolling past a giant forest.
  const islandAreaHeight = Math.min(480, Math.max(340, windowWidth * 0.85));

  // ForestIsland reports its exact fitted height; the pinch viewport mirrors
  // it so there is no dead space (or clipping) around the island. Pinch zoom
  // only kicks in for larger forests and never under reduced motion.
  const [islandFittedHeight, setIslandFittedHeight] = useState<number | null>(null);
  const handleIslandLayout = useCallback((fittedHeight: number) => {
    setIslandFittedHeight((prev) => (prev === fittedHeight ? prev : fittedHeight));
  }, []);
  const canvasViewportHeight = islandFittedHeight ?? islandAreaHeight;
  const zoomEnabled = !reducedMotion && previewCheckIns.length > 12;

  const handleSelect = useCallback((checkIn: ForestCheckIn) => setSelected(checkIn), []);
  const closeSheet = useCallback(() => setSelected(null), []);

  // Milestones render as a chip under the title too — same copy the toast uses.
  const reachedMilestones = useMemo(
    () => checkIns.filter((c) => c.milestone !== null),
    [checkIns],
  );
  const latestReachedMilestone =
    reachedMilestones.length === 0 ? null : reachedMilestones[reachedMilestones.length - 1];

  const goCheckIn = useCallback(() => {
    navigation.navigate('StudentTabs', { screen: 'StudentAssignments' });
  }, [navigation]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  /** Dev/review entry point to the synthetic 0 / 1 / 12 / 50+ datasets. */
  const openPreviewMenu = useCallback(() => setShowPreviewMenu(true), []);
  const viewResults = useCallback(() => {
    setSelected(null);
    navigation.navigate('StudentTabs', { screen: 'StudentAssignments' });
  }, [navigation]);

  const shift = useCallback(
    (direction: number) => setAnchor((current) => shiftPeriod(mode, current, direction)),
    [mode],
  );
  const changeMode = useCallback((next: PeriodMode) => {
    setMode(next);
    setAnchor(new Date());
  }, []);

  const canGoForward = useMemo(() => range.end.getTime() <= Date.now() + 86400000, [range]);

  // ─── Share: export the island as a PNG ──────────────────────────────────
  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(islandCaptureRef, {
        format: 'png',
        quality: 1,
        // Android needs an explicit pixelRatio; iOS defaults to 2.
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
      await Share.share({
        title: 'My Forest',
        message: `My forest on Spartan-G — ${previewCheckIns.length} check-ins and counting. 🌱`,
        url: uri,
      });
      setShareStatus('Forest image ready to share.');
    } catch {
      setShareStatus('Couldn’t capture your forest image. Try again.');
    } finally {
      setSharing(false);
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShareStatus(null), 3200);
    }
  }, [sharing, previewCheckIns.length]);

  // ─── Loading / error ─────────────────────────────────────────────────────
  if (loading && !isPreview) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle}>My Forest</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ForestSkeleton />
      </View>
    );
  }

  if (error && !isPreview) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle}>My Forest</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.center}>
          <View style={styles.errorBadge}>
            <Feather name="alert-triangle" size={26} color={forestColors.bgDeep} />
          </View>
          <Text style={styles.errorTitle}>Unable to load forest</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => load()}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Main ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <MilestoneToast
        visible={toast !== null}
        title={toast?.title ?? ''}
        message={toast?.message ?? ''}
        reducedMotion={reducedMotion}
        onHide={hideToast}
      />

      {/* Top bar: back, title, share (+ preview switcher for design review) */}
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Feather name="chevron-left" size={22} color={forestColors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Pressable
            onPress={openPreviewMenu}
            accessibilityRole="button"
            accessibilityLabel="My Forest — activate for preview options"
            accessibilityHint="Opens the 0, 1, 12, and 50 check-in previews"
          >
            <Text style={styles.headerTitle}>My Forest</Text>
          </Pressable>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {periodCheckIns.length === 0
              ? 'Every check-in grows a tree'
              : `${periodCheckIns.length} tree${periodCheckIns.length === 1 ? '' : 's'} in ${range.label}`}
          </Text>
        </View>
        <Pressable
          onPress={handleShare}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Share my forest"
          accessibilityState={{ disabled: sharing }}
          disabled={sharing}
          hitSlop={8}
        >
          <Feather name="share-2" size={20} color={forestColors.text} />
        </Pressable>
        <Pressable
          onPress={() => setShowPreviewMenu(true)}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Preview forest with sample data"
          hitSlop={8}
        >
          <Feather name="sliders" size={18} color={forestColors.textMuted} />
        </Pressable>
      </View>

      <PeriodTabs
        mode={mode}
        range={range}
        onModeChange={changeMode}
        onShift={shift}
        canGoForward={canGoForward}
      />

      {/* Milestone chip — restores the v1 "1st check-in" pin row on the new screen. */}
      {latestReachedMilestone !== null && latestReachedMilestone.milestone !== null && (
        <View style={styles.milestoneChip} accessible accessibilityLabel={`${milestoneLabel(latestReachedMilestone.milestone)} reached`}>
          <Feather name="map-pin" size={13} color={forestColors.golden} />
          <Text style={styles.milestoneChipText}>
            {milestoneLabel(latestReachedMilestone.milestone)}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={forestColors.text}
            colors={[forestColors.grassLight]}
            progressBackgroundColor={forestColors.bgDeep}
          />
        }
      >
        {/* Island — this subtree is what the share button captures. The canvas
            adds pinch-to-zoom for large forests; ForestIsland reports its
            fitted size so the viewport always matches the island exactly. */}
        <View ref={islandCaptureRef} collapsable={false} style={styles.islandWrap}>
          <ForestCanvas
            viewportWidth={windowWidth - spacing.md * 2}
            viewportHeight={canvasViewportHeight}
            enabled={zoomEnabled}
          >
            <ForestIsland
              checkIns={periodCheckIns}
              animateInAttemptId={animateInId}
              reducedMotion={reducedMotion}
              onSelectTree={handleSelect}
              availableWidth={windowWidth - spacing.md * 2}
              availableHeight={islandAreaHeight}
              onLayout={handleIslandLayout}
            />
          </ForestCanvas>
        </View>

        {periodCheckIns.length === 0 && previewCheckIns.length > 0 && (
          <Text style={styles.emptyHint}>
            No check-ins in {range.label} yet. Complete one to plant a tree here.
          </Text>
        )}

        {/* Friendly empty state: the island stays visible below so the prompt
            reads as an empty plot waiting for its first tree. */}
        {previewCheckIns.length === 0 && (
          <View style={styles.emptyCard} accessible accessibilityLabel="Your island is empty. Complete a check-in to plant your first tree.">
            <Feather name="plus-circle" size={30} color={forestColors.grassLight} />
            <Text style={styles.emptyTitle}>Your island is waiting</Text>
            <Text style={styles.emptyBody}>
              Complete a check-in to plant your first tree and start your forest.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={goCheckIn}
              accessibilityRole="button"
              accessibilityLabel="Start a check-in"
            >
              <Text style={styles.emptyButtonText}>Start a check-in</Text>
            </TouchableOpacity>
          </View>
        )}

        <ForestStats
          checkIns={periodCheckIns.length}
          minutes={minutes}
          healthyTrees={healthyTrees}
          witheredTrees={witheredTrees}
          streakDay={currentStreak}
        />

        <ActivityChart
          buckets={buckets}
          title={`Activity · ${range.label}`}
          summary={`${periodCheckIns.length} check-in${periodCheckIns.length === 1 ? '' : 's'}`}
        />

        <View style={styles.legend}>
          {LEGEND_ITEMS.map((item) => (
            <View key={item.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {shareStatus !== null && (
          <Text
            style={styles.shareStatus}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={shareStatus}
          >
            {shareStatus}
          </Text>
        )}

        <Text style={styles.footNote}>
          Trees are seeded by your check-in history — the same check-in always grows the same tree.
        </Text>
      </ScrollView>

      <TreeDetailSheet
        checkIn={selected}
        placeName={placeName}
        studentId={session?.uid}
        onClose={closeSheet}
        onViewResults={viewResults}
      />

      <Modal
        visible={showPreviewMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPreviewMenu(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setShowPreviewMenu(false)} />
        <View style={styles.menuCard}>
          <Text style={styles.menuTitle}>Preview forest</Text>
          <Text style={styles.menuBody}>
            Sample histories for design review. Default is your real check-in data.
          </Text>
          {(['real', 'zero', 'one', 'twelve', 'fifty'] as ForestPreviewKey[]).map((key) => {
            const active = previewKey === key;
            const option = FOREST_PREVIEW_OPTIONS.find((item) => item.key === key);
            return (
              <TouchableOpacity
                key={key}
                style={[styles.menuItem, active && styles.menuItemActive]}
                onPress={() => {
                  setPreviewKey(key);
                  setShowPreviewMenu(false);
                  setAnchor(new Date());
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={styles.menuItemText}>{option?.label ?? key}</Text>
                {active && <Feather name="check" size={16} color={forestColors.grassLight} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}


// Legend swatches reuse the same tokens the trees are painted with.
const LEGEND_ITEMS = [
  { key: 'pine', label: 'Pine', color: forestColors.pine },
  { key: 'bush', label: 'Bush', color: forestColors.bush },
  { key: 'bloom', label: 'Bloom', color: forestColors.bloomPurple },
  { key: 'bare', label: 'Withered', color: forestColors.bare },
  { key: 'golden', label: 'Milestone', color: forestColors.golden },
] as const;

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: forestColors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: forestColors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 36, height: 36 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: forestColors.text, fontSize: fontSize.lg, fontWeight: '700' },
  headerSubtitle: { color: forestColors.textMuted, fontSize: fontSize.xs, marginTop: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing['2xl'], gap: spacing.md },
  islandWrap: {
    backgroundColor: forestColors.bgDeep,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  emptyHint: {
    color: forestColors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  milestoneChip: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: forestColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: forestColors.golden,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  milestoneChipText: { color: forestColors.golden, fontSize: fontSize.xs, fontWeight: '700' },
  emptyCard: {
    backgroundColor: forestColors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: forestColors.surfaceBorder,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { color: forestColors.text, fontSize: fontSize.md, fontWeight: '700' },
  emptyBody: { color: forestColors.textSecondary, fontSize: fontSize.sm, textAlign: 'center' },
  emptyButton: {
    marginTop: spacing.xs,
    backgroundColor: forestColors.chipActive,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyButtonText: { color: forestColors.text, fontSize: fontSize.sm, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: forestColors.textMuted, fontSize: fontSize.xs, fontWeight: '600' },
  footNote: {
    color: forestColors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 15,
    opacity: 0.85,
  },
  shareStatus: {
    color: forestColors.textSecondary,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  errorBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: forestColors.golden,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: { color: forestColors.text, fontSize: fontSize.lg, fontWeight: '700' },
  errorBody: { color: forestColors.textSecondary, fontSize: fontSize.sm, textAlign: 'center' },
  retryButton: {
    marginTop: spacing.sm,
    backgroundColor: forestColors.chipActive,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: { color: forestColors.text, fontSize: fontSize.sm, fontWeight: '700' },
  menuBackdrop: { flex: 1, backgroundColor: forestColors.scrim },
  menuCard: {
    backgroundColor: forestColors.bgDeep,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: forestColors.surfaceBorder,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  menuTitle: { color: forestColors.text, fontSize: fontSize.md, fontWeight: '700' },
  menuBody: { color: forestColors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.xs },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  menuItemActive: { backgroundColor: forestColors.surface },
  menuItemText: { color: forestColors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
});

