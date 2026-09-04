/**
 * NotificationsScreen — in-app notification center opened from the dashboard bell.
 *
 * Real-time: subscribes live to the user's `notifications` documents so new
 * message/appointment activity appears without a manual refresh. Tapping a row
 * marks it read and deep-links to the related chat or (until that detail screen
 * exists) the Appointments tab. Opening a conversation in Messages also marks
 * that conversation's message notifications read (see MessagingService).
 * Unread rows are tinted with a red dot + bold title; read rows are muted.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {
  FacilitatorMobileStackParamList,
  NotificationDocument,
  StudentMobileStackParamList,
} from '@spartan-g/shared-types';
import { appointmentService, notificationRepository, useAuthStore } from '@spartan-g/shared-services';
import { lightColors, palette } from '@spartan-g/shared-ui';

type NotifiedDoc = NotificationDocument & { id: string };
// Intersection of both role stacks: every screen this list can deep-link to
// exists in at least one of them (mirrors how DashboardScreen navigates).
type NotifNavProp = NativeStackNavigationProp<
  StudentMobileStackParamList & FacilitatorMobileStackParamList
>;

/* ─── Per-type presentation tokens ───────────────────────────── */
const TYPE_META: Record<NotificationDocument['type'], { icon: string; label: string; iconColor: string; iconBg: string }> = {
  message:     { icon: 'message-circle', label: 'Message',     iconColor: '#4338CA', iconBg: '#EEF2FF' },
  appointment: { icon: 'calendar',       label: 'Appointment', iconColor: '#047857', iconBg: '#ECFDF5' },
  reschedule:  { icon: 'repeat',         label: 'Reschedule',  iconColor: '#D97706', iconBg: '#FFFBEB' },
  info:        { icon: 'info',           label: 'Info',        iconColor: '#0369A1', iconBg: '#E0F2FE' },
  alert:       { icon: 'alert-triangle', label: 'Alert',       iconColor: '#B45309', iconBg: '#FFF7ED' },
  risk:        { icon: 'alert-octagon',  label: 'Risk Alert',  iconColor: '#BE123C', iconBg: '#FFF1F2' },
  assignment:  { icon: 'book-open',      label: 'Assignment',  iconColor: '#4338CA', iconBg: '#EEF2FF' },
  grade:       { icon: 'award',          label: 'Grade',       iconColor: '#4338CA', iconBg: '#EEF2FF' },
  work_hours:  { icon: 'clock',          label: 'Work Hours',  iconColor: '#0369A1', iconBg: '#E0F2FE' },
};

function metaFor(type: NotificationDocument['type'] | undefined) {
  return (type && TYPE_META[type]) || TYPE_META.info;
}

/* ─── Relative timestamps ("5m ago") ─────────────────────────── */
function formatRelativeTime(doc: NotifiedDoc): string {
  // Tolerates both createdAt and legacy created_at keys (see repository note)
  const raw = (doc.createdAt ?? (doc as any).created_at) as any;
  if (!raw) return '';
  const ms =
    typeof raw === 'object' && typeof raw.toMillis === 'function'
      ? raw.toMillis()
      : new Date(raw).getTime();
  if (Number.isNaN(ms)) return '';

  const diffMinutes = Math.floor((Date.now() - ms) / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ─── Single notification row ────────────────────────────────── */
function NotificationRow({
  item,
  onPress,
}: {
  item: NotifiedDoc;
  onPress: (item: NotifiedDoc) => void;
}) {
  const meta = metaFor(item.type);
  return (
    <TouchableOpacity
      style={[styles.row, !item.isRead && styles.rowUnread]}
      activeOpacity={0.6}
      onPress={() => onPress(item)}
    >
      <View style={[styles.iconCircle, { backgroundColor: meta.iconBg }]}>
        <Feather name={meta.icon as any} size={18} color={meta.iconColor} />
        {!item.isRead && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTopLine}>
          <Text style={[styles.rowTitle, item.isRead && styles.rowTitleRead]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.rowTime}>{formatRelativeTime(item)}</Text>
        </View>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[styles.rowTag, { color: meta.iconColor }]}>{meta.label}</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ─── Empty state ────────────────────────────────────────────── */
function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Feather name="bell-off" size={28} color="#CBD5E1" />
      </View>
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptySubtitle}>
        Messages and appointment updates will show up here.
      </Text>
    </View>
  );
}

/* ─── Screen ─────────────────────────────────────────────────── */
export function NotificationsScreen() {
  const navigation = useNavigation<NotifNavProp>();
  const session = useAuthStore((s) => s.session);
  const userId = session?.uid ?? '';
  const role = session?.role;

  const [notifications, setNotifications] = useState<NotifiedDoc[]>([]);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  // Live listener — keeps this list and the dashboard badge in sync instantly
  useEffect(() => {
    if (!userId) return;
    const unsubscribe = notificationRepository.subscribeByUserId(userId, (docs) =>
      setNotifications(docs),
    );
    return unsubscribe;
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = useCallback(async () => {
    if (!userId || unreadCount === 0) return;
    setIsMarkingAll(true);
    try {
      await appointmentService.markAllNotificationsRead(userId);
    } catch (err) {
      console.error('[Notifications] Failed to mark all as read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  }, [userId, unreadCount]);

  const handlePress = useCallback(
    async (item: NotifiedDoc) => {
      // Mark read first so the live listener drops it from the badge everywhere
      if (!item.isRead) {
        appointmentService.markNotificationRead(item.id).catch(() => {});
      }

      // Deep-link to related content using the app's spartan-g:// routes,
      // mirroring how tapping a push notification navigates.
      if (item.type === 'message' && item.relatedId) {
        navigation.navigate('ConversationDetail', { conversationId: item.relatedId });
        return;
      }

      if (item.type === 'appointment' || item.type === 'reschedule') {
        // AppointmentDetail is still a placeholder screen — open the relevant
        // tabs screen instead until it exists.
        try {
          if (role === 'facilitator') {
            navigation.navigate('FacilitatorTabs', { screen: 'Appointments' });
          } else {
            navigation.navigate('StudentTabs', { screen: 'StudentHome' });
          }
        } catch {
          /* Route unavailable in this stack — stay put */
        }
      }
    },
    [navigation, role],
  );

  const renderItem = useCallback(
    ({ item }: { item: NotifiedDoc }) => (
      <NotificationRow item={item} onPress={handlePress} />
    ),
    [handlePress],
  );

  return (
    <View style={styles.container}>
      {/* ─── Maroon header matching the dashboard ───────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
        >
          <Feather name="chevron-left" size={22} color={palette.spartanGold} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity
            style={[styles.headerButton, isMarkingAll && styles.headerButtonDisabled]}
            activeOpacity={0.7}
            disabled={isMarkingAll}
            onPress={handleMarkAllRead}
          >
            {isMarkingAll ? (
              <ActivityIndicator size="small" color={palette.spartanGold} />
            ) : (
              <Feather name="check-circle" size={20} color={palette.spartanGold} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={<EmptyState />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={
          notifications.length === 0 ? styles.listEmpty : styles.listContent
        }
        initialNumToRender={12}
        maxToRenderPerBatch={12}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  /* ─── Header (matches dashboard maroon header) ────────────── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.spartanRedDark,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.spartanGold,
    marginTop: 2,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },

  /* ─── List rows ───────────────────────────────────────────── */
  listContent: {
    paddingBottom: 32,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 62,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  rowUnread: {
    backgroundColor: '#F8FAFC',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.spartanRed,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  rowContent: {
    flex: 1,
  },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: lightColors.text,
  },
  rowTitleRead: {
    fontWeight: '600',
    color: lightColors.textMuted,
  },
  rowTime: {
    fontSize: 11,
    fontWeight: '600',
    color: lightColors.textMuted,
  },
  rowBody: {
    fontSize: 13,
    lineHeight: 18,
    color: lightColors.textMuted,
    marginTop: 2,
  },
  rowTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 6,
  },

  /* ─── Empty state ─────────────────────────────────────────── */
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.text,
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: lightColors.textMuted,
    marginTop: 4,
  },
});
