import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore, gardenService, assessmentService } from '@spartan-g/shared-services';
import { StudentGardenDocument, AssessmentAttemptDocument, AssessmentDefinitionDocument } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { GardenTree } from './components/GardenTree';

export function GardenScreen() {
  const session = useAuthStore((s) => s.session);
  const [garden, setGarden] = useState<(StudentGardenDocument & { id: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Card 2: Current Assessment Progress (question-answered tree) ────────
  const [attempt, setAttempt] = useState<(AssessmentAttemptDocument & { id: string }) | null>(null);
  const [assessmentDef, setAssessmentDef] = useState<(AssessmentDefinitionDocument & { id: string }) | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(true);

  const loadGarden = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      const result = await gardenService.getOrCreateGarden(session.uid);
      if (result) {
        setGarden(result);
      } else {
        setError('Failed to load garden data.');
      }
    } catch {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session]);

  // Load the most relevant assessment attempt for the question-answered tree.
  // Priority: in-progress attempt first, else most recent submitted/graded.
  const loadAttempt = useCallback(async () => {
    if (!session) return;
    try {
      setAttemptLoading(true);

      // 1. Prefer an in-progress attempt (resume scenario)
      const inProgressAttempts = await assessmentService.getInProgressAttemptsByStudent(session.uid);
      let chosen = inProgressAttempts[0] ?? null;

      // 2. Fall back to the most recent submitted/graded attempt
      if (!chosen) {
        const submittedAttempts = await assessmentService.getAttemptsByStudent(session.uid);
        chosen = submittedAttempts[0] ?? null;
      }

      if (chosen) {
        setAttempt(chosen);
        const def = await assessmentService.getAssessmentDefinition(chosen.assessmentId);
        setAssessmentDef(def);
      } else {
        setAttempt(null);
        setAssessmentDef(null);
      }
    } catch {
      // Read-only fetch — on failure just show the empty state
      setAttempt(null);
      setAssessmentDef(null);
    } finally {
      setAttemptLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadGarden();
  }, [loadGarden]);

  // Refresh the assessment tree whenever the Garden tab gains focus
  // (e.g. after answering questions in an assessment and switching tabs).
  useFocusEffect(
    useCallback(() => {
      loadAttempt();
    }, [loadAttempt]),
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadGarden();
    loadAttempt();
  }, [loadGarden, loadAttempt]);

  // ─── Loading state ──────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading your garden...</Text>
      </View>
    );
  }

  // ─── Error state ────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Unable to Load Garden</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  if (!garden) return null;

  const xpNeededForNextLevel = garden.level * 50;
  const xpProgressPercent = Math.min(Math.round((garden.xp / xpNeededForNextLevel) * 100), 100);

  // Card 2 data — derived from the fetched attempt
  const totalQuestions = assessmentDef?.questions?.length ?? 0;
  const answeredCount = attempt
    ? attempt.answers.filter((a) => a.value !== undefined && a.value !== '').length
    : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={lightColors.primary}
        />
      }
    >
      {/* Header */}
      <View>
        <Text style={styles.title}>My Garden</Text>
        <Text style={styles.subtitle}>Your growth journey — keep watering!</Text>
      </View>

      {/* Card 1 — Level N Tree (XP/Level hero card, unchanged from original) */}
      <View style={styles.treeCard}>
        <View style={styles.treeCircle}>
          <Text style={styles.treeEmoji}>🌱</Text>
        </View>
        <Text style={styles.treeLabel}>Level {garden.level} Tree</Text>
        {/* When artwork is ready, replace the emoji above with:
            <Image source={require('../../assets/garden/tree_lv1.png')} style={styles.treeImage} />
        */}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {/* XP Card */}
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{garden.xp}</Text>
          <Text style={styles.statLabel}>XP</Text>
          <View style={styles.xpBarTrack}>
            <View style={[styles.xpBarFill, { width: `${xpProgressPercent}%` }]} />
          </View>
          <Text style={styles.xpBarText}>
            {garden.xp} / {xpNeededForNextLevel} XP
          </Text>
        </View>

        {/* Seeds Card */}
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{garden.seeds}</Text>
          <Text style={styles.statLabel}>Seeds</Text>
        </View>

        {/* Streak Card */}
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{garden.streakCount}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>

        {/* Level Card */}
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{garden.level}</Text>
          <Text style={styles.statLabel}>Level</Text>
        </View>
      </View>

      {/* Card 2 — Current Assessment Progress (question-answered tree) */}
      <View style={styles.assessmentCard}>
        <Text style={styles.assessmentCardTitle}>Current Assessment Progress</Text>
        {attemptLoading ? (
          <View style={styles.assessmentLoading}>
            <ActivityIndicator size="small" color={lightColors.primary} />
          </View>
        ) : attempt && assessmentDef ? (
          <>
            <GardenTree totalQuestions={totalQuestions} answeredCount={answeredCount} />
            <Text style={styles.assessmentCardSubtitle}>
              {answeredCount} of {totalQuestions} questions answered
            </Text>
          </>
        ) : (
          <>
            <GardenTree totalQuestions={0} answeredCount={0} />
            <Text style={styles.assessmentEmptyText}>
              Take your first assessment to grow this tree!
            </Text>
          </>
        )}
      </View>

      {/* Last Check-in */}
      <View style={styles.checkInCard}>
        <Text style={styles.checkInLabel}>Last Check-in</Text>
        <Text style={styles.checkInDate}>
          {garden.lastCheckInDate || 'Not yet checked in'}
        </Text>
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
  },
  subtitle: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 4,
  },
  treeCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  treeCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  treeEmoji: {
    fontSize: 48,
  },
  treeLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: lightColors.primary,
  },
  statLabel: {
    fontSize: 13,
    color: lightColors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  xpBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: lightColors.border,
    marginTop: 8,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: lightColors.primary,
  },
  xpBarText: {
    fontSize: 11,
    color: lightColors.textMuted,
    marginTop: 4,
  },
  assessmentCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  assessmentCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    alignSelf: 'flex-start',
  },
  assessmentCardSubtitle: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  assessmentEmptyText: {
    fontSize: 13,
    color: lightColors.textSecondary,
    textAlign: 'center',
  },
  assessmentLoading: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkInLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.text,
  },
  checkInDate: {
    fontSize: 14,
    color: lightColors.textSecondary,
  },
});