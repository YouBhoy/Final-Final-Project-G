import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';
import { getFirestoreDb } from '@spartan-g/shared-services/src/firebase/firestore';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import type { AssessmentDefinitionDocument } from '@spartan-g/shared-types';

type AssessmentWithId = AssessmentDefinitionDocument & { id: string };

export function FacilitatorAssessmentsScreen() {
  const session = useAuthStore((s) => s.session);

  const [assessments, setAssessments] = useState<AssessmentWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const db = getFirestoreDb();
        const q = query(collection(db, 'assessments'), orderBy('title', 'asc'));
        const snapshot = await getDocs(q);

        if (!cancelled) {
          const items: AssessmentWithId[] = [];
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            // Only include Phase 3B assessment definitions (have courseId)
            if (data.courseId && typeof data.courseId === 'string') {
              items.push({ id: doc.id, ...data } as AssessmentWithId);
            }
          });
          setAssessments(items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load assessments');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [session]);

  // ─── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading assessments…</Text>
      </View>
    );
  }

  // ─── Error ───────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Failed to Load</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View>
        <Text style={styles.title}>Assessments</Text>
        <Text style={styles.subtitle}>
          View the assessments published for students.
        </Text>
      </View>

      {/* Empty state */}
      {assessments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>{'\uD83D\uDCDD'}</Text>
          <Text style={styles.emptyTitle}>No assessments available</Text>
          <Text style={styles.emptyDescription}>
            Assessments created by the super admin will appear here.
          </Text>
        </View>
      ) : (
        /* Assessment list */
        <View style={styles.list}>
          {assessments.map((a) => (
            <View key={a.id} style={styles.assessmentCard}>
              <View style={styles.assessmentHeader}>
                <View style={styles.assessmentTitleSection}>
                  <Text style={styles.assessmentTitle}>{a.title}</Text>
                  {a.description && (
                    <Text style={styles.assessmentDescription} numberOfLines={2}>
                      {a.description}
                    </Text>
                  )}
                </View>
                <View style={styles.statusBadge}>
                  <Text style={[styles.statusText, a.isPublished ? styles.statusPublished : styles.statusDraft]}>
                    {a.isPublished ? 'Published' : 'Draft'}
                  </Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Course</Text>
                  <View style={styles.courseBadge}>
                    <Text style={styles.courseBadgeText}>{a.courseId}</Text>
                  </View>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Questions</Text>
                  <Text style={styles.metaValue}>
                    {Array.isArray(a.questions) ? a.questions.length : 0}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
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
    paddingBottom: 32,
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
  emptyCard: {
    borderWidth: 2,
    borderColor: lightColors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: lightColors.surface,
    padding: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  emptyDescription: {
    fontSize: 13,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  list: {
    gap: 12,
  },
  assessmentCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  assessmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  assessmentTitleSection: {
    flex: 1,
    marginRight: 12,
  },
  assessmentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 2,
  },
  assessmentDescription: {
    fontSize: 13,
    color: lightColors.textSecondary,
    lineHeight: 18,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F1F5F9',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusPublished: {
    color: '#16A34A',
  },
  statusDraft: {
    color: lightColors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.text,
  },
  courseBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  courseBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4338CA',
  },
});