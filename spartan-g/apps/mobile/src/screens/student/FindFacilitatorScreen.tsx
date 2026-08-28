import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import { Feather } from '@expo/vector-icons';
import { useAuthStore, userService, workHoursService, profileRepository } from '@spartan-g/shared-services';
import { ALL_CAMPUSES, CAMPUS_SHORT_LABELS, getCampusLabel, type Campus } from '@spartan-g/shared-types';
import { lightColors, palette, formatWorkHours } from '@spartan-g/shared-ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function FindFacilitatorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const authSession = useAuthStore((st) => st.session);

  const [facilitators, setFacilitators] = useState<{ id: string; displayName: string; email: string }[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, { bio?: string; campus?: string }>>({});
  const [workHoursMap, setWorkHoursMap] = useState<Record<string, any[]>>({});
  const [selectedFacilitator, setSelectedFacilitator] = useState<string | null>(null);
  const [campusFilter, setCampusFilter] = useState<Campus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mount guard: prevents setState after unmount (replaces old `cancelled` flag pattern)
  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const loadFacilitators = useCallback(async () => {
    if (!authSession) { setIsLoading(false); setIsRefreshing(false); return; }

    try {
      setError(null);
      setFacilitators([]);
      setProfilesMap({});
      setWorkHoursMap({});

      const users = await userService.listFacilitatorsByCampus(
        authSession.role,
        campusFilter === 'all' ? undefined : campusFilter,
      );
      if (!isMounted.current) return;

      const mapped = users.map((u: any) => ({
        id: u.id,
        displayName: u.displayName || 'Facilitator',
        email: u.email || '',
      }));
      setFacilitators(mapped);

      const whMap: Record<string, any[]> = {};
      const pMap: Record<string, { bio?: string; campus?: string }> = {};
      await Promise.allSettled(
        mapped.map(async (fac) => {
          try {
            const schedule = await workHoursService.getActiveSchedule(fac.id, authSession.role);
            whMap[fac.id] = schedule;
          } catch {
            whMap[fac.id] = [];
          }
          try {
            const profile = await profileRepository.getById(fac.id);
            if (profile) pMap[fac.id] = { bio: profile.bio, campus: profile.campus };
          } catch {
            // Profile is optional — facilitator may not have created one yet.
          }
        }),
      );
      if (!isMounted.current) return;
      setWorkHoursMap(whMap);
      setProfilesMap(pMap);
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load facilitators.');
    } finally {
      if (isMounted.current) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, [authSession, campusFilter]);

  useEffect(() => {
    loadFacilitators();
  }, [loadFacilitators]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadFacilitators();
    setIsRefreshing(false);
  }, [loadFacilitators]);

  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading facilitators...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={palette.spartanRed} />
      }
    >
      <Text style={styles.title}>Find a Facilitator</Text>

      {/* Campus filter chips */}
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, campusFilter === 'all' && styles.chipActive]}
          onPress={() => setCampusFilter('all')}
        >
          <Text style={[styles.chipText, campusFilter === 'all' && styles.chipTextActive]}>
            All campuses
          </Text>
        </Pressable>
        {ALL_CAMPUSES.map((c) => (
          <Pressable
            key={c}
            style={[styles.chip, campusFilter === c && styles.chipActive]}
            onPress={() => setCampusFilter(c)}
          >
            <Text style={[styles.chipText, campusFilter === c && styles.chipTextActive]}>
              {CAMPUS_SHORT_LABELS[c]}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && (
        <View style={[styles.errorBanner, { backgroundColor: lightColors.errorBackground, borderColor: lightColors.errorBorder }]}>
          <Text style={{ color: lightColors.errorText, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {facilitators.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No facilitators are currently available.</Text>
        </View>
      ) : (
        <View style={styles.facilitatorList}>
          {facilitators.map((fac) => {
            const schedule = workHoursMap[fac.id] || [];
            const activeDays = schedule.filter((s: any) => s.isActive).map((s: any) => DAYS[s.dayOfWeek] ?? 'Unknown');
            const initial = (fac.displayName || 'F').charAt(0).toUpperCase();
            const isExpanded = selectedFacilitator === fac.id;

            return (
              <TouchableOpacity
                key={fac.id}
                onPress={() => setSelectedFacilitator((prev) => (prev === fac.id ? null : fac.id))}
                style={styles.facilitatorCard}
                activeOpacity={0.7}
              >
                <View style={styles.facilitatorHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>
                  <View style={styles.facilitatorInfo}>
                    <Text style={styles.facilitatorName}>{fac.displayName}</Text>
                    <Text style={styles.facilitatorEmail}>{fac.email}</Text>
                    {profilesMap[fac.id]?.campus && (
                      <View style={styles.facilitatorCampusRow}>
                        <Feather name="map-pin" size={12} color={lightColors.textSecondary} />
                        <Text style={styles.facilitatorCampus}>
                          {getCampusLabel(profilesMap[fac.id].campus as Campus)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {isExpanded && (
                  <View style={styles.expandedSection}>
                    <Text style={styles.sectionLabel}>About</Text>
                    {profilesMap[fac.id]?.bio ? (
                      <Text style={styles.facilitatorBio}>{profilesMap[fac.id].bio}</Text>
                    ) : (
                      <Text style={styles.facilitatorBioMuted}>No bio yet.</Text>
                    )}

                    <Text style={styles.sectionLabel}>Available Hours</Text>

                    {activeDays.length === 0 ? (
                      <Text style={styles.noAvailability}>No availability set</Text>
                    ) : (
                      <View style={styles.scheduleList}>
                        {schedule.filter((s: any) => s.isActive).map((s: any) => (
                          <View key={s.id} style={styles.scheduleRow}>
                            <Text style={styles.scheduleDay}>{DAYS[s.dayOfWeek] ?? 'Unknown'}</Text>
                            <Text style={styles.scheduleTime}>{formatWorkHours(s.startTime, s.endTime)}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => navigation.navigate('BookAppointment', { facilitatorId: fac.id })}
                      style={styles.bookButton}
                    >
                      <Text style={styles.bookButtonText}>Book Appointment</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: lightColors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: lightColors.border,
    backgroundColor: lightColors.surface,
  },
  chipActive: {
    backgroundColor: palette.spartanRed,
    borderColor: palette.spartanRed,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: lightColors.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
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
  emptyText: {
    fontSize: 14,
    color: lightColors.textMuted,
    textAlign: 'center',
  },
  facilitatorList: {
    gap: 12,
  },
  facilitatorCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  facilitatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: lightColors.infoBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.infoBadgeText,
  },
  facilitatorInfo: {
    flex: 1,
  },
  facilitatorName: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.text,
  },
  facilitatorEmail: {
    fontSize: 13,
    color: lightColors.textSecondary,
    marginTop: 1,
  },
  facilitatorCampusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  facilitatorCampus: {
    fontSize: 12,
    color: lightColors.textSecondary,
    fontWeight: '600',
  },
  facilitatorBio: {
    fontSize: 13,
    color: lightColors.text,
    lineHeight: 18,
  },
  facilitatorBioMuted: {
    fontSize: 13,
    color: lightColors.textMuted,
    fontStyle: 'italic',
  },
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: lightColors.border,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.textSecondary,
  },
  noAvailability: {
    fontSize: 13,
    color: lightColors.textMuted,
    fontStyle: 'italic',
  },
  scheduleList: {
    gap: 4,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scheduleDay: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  scheduleTime: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.text,
  },
  bookButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  bookButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});