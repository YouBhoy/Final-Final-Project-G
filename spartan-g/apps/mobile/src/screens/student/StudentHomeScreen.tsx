import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';
import { useAuthStore, assessmentTemplateService } from '@spartan-g/shared-services';
import {
  ROLES,
  getCampusLabel,
  type AssessmentTemplateDocument,
} from '@spartan-g/shared-types';

export function StudentHomeScreen() {
  const session = useAuthStore((s) => s.session);

  const [templates, setTemplates] = useState<
    (AssessmentTemplateDocument & { id: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = async () => {
    if (!session?.uid) return;
    try {
      const role = session.role;
      const list = await assessmentTemplateService.listActiveTemplates(role);
      setTemplates(list as (AssessmentTemplateDocument & { id: string })[]);
      setError(null);
    } catch {
      setError('Could not load available assessments.');
    }
  };

  useEffect(() => {
    loadTemplates().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.uid]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTemplates();
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />
      }
    >
      <Text style={styles.greeting}>
        {session?.displayName ? `Hello, ${session.displayName.split(' ')[0]}` : 'Welcome'}
      </Text>
      <Text style={styles.subtitle}>
        {getCampusLabel(session?.campus)} · {ROLES.STUDENT === session?.role ? 'Student' : ''}
      </Text>

      <Text style={styles.sectionTitle}>Available Assessments</Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={lightColors.primary} size="large" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : templates.length === 0 ? (
        <Text style={styles.empty}>No assessments are available right now.</Text>
      ) : (
        templates.map((t) => (
          <TouchableOpacity key={t.id} style={styles.card}>
            <Text style={styles.cardTitle}>{t.title}</Text>
            <Text style={styles.cardDesc} numberOfLines={2}>
              {t.description}
            </Text>
            <View style={styles.cardMeta}>
              <Text style={styles.cardMetaText}>{t.questionCount} questions</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: lightColors.background,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: lightColors.text,
  },
  subtitle: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textTransform: 'capitalize',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: 12,
  },
  loader: {
    marginTop: 32,
  },
  error: {
    color: lightColors.error,
    textAlign: 'center',
    marginTop: 24,
  },
  empty: {
    color: lightColors.textSecondary,
    textAlign: 'center',
    marginTop: 24,
  },
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginBottom: 8,
  },
  cardMeta: {
    alignSelf: 'flex-start',
    backgroundColor: lightColors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardMetaText: {
    fontSize: 12,
    color: lightColors.textSecondary,
  },
});