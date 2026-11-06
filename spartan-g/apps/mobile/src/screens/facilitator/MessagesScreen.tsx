import { useState, useRef, useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FacilitatorMobileStackParamList, ConversationDocument } from '@spartan-g/shared-types';
import { useAuthStore, messagingService, userService } from '@spartan-g/shared-services';
import { StudentPageHeader, StudentPageBackground, StudentSearchField, StudentPageNotice, studentPageColors as colors } from '../../components/StudentPageDesign';
import { filterConversationList, conversationDateLabel } from '../student/student-list-models';

type Conversation = ConversationDocument & { id: string };
type ConversationSnapshot = { uid: string; conversations: Conversation[]; names: Record<string, string> };

export function FacilitatorMessagesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FacilitatorMobileStackParamList>>();
  const session = useAuthStore(s => s.session);
  const authStatus = useAuthStore(s => s.status);
  const [snapshot, setSnapshot] = useState<ConversationSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(0);

  // One focus refresh preserves read/unread behaviour after leaving a conversation.
  // A request generation prevents outgoing sessions from publishing late results.
  useFocusEffect(useCallback(() => {
    const request = ++requestRef.current;
    const current = () => requestRef.current === request;
    setError(null);
    setIsLoading(true);
    if (authStatus !== 'authenticated' || !session || session.role !== 'facilitator') {
      setSnapshot(null); setIsLoading(false); setIsRefreshing(false);
      return;
    }
    const uid = session.uid;
    const load = async () => {
      try {
        const records = await messagingService.getConversations(uid, session.role);
        if (!current()) return;
        const conversations = records.filter(c => c.participantIds.includes(uid));
        const names: Record<string, string> = {};
        for (const conv of conversations) {
          for (const participantId of conv.participantIds) {
            if (!current()) return;
            if (participantId !== uid && !names[participantId]) {
              try {
                const userDoc = await userService.getUser(participantId);
                if (!current()) return;
                if (userDoc) names[participantId] = userDoc.displayName || 'Conversation';
              } catch { /* An unavailable participant profile must not hide authorized messages. */ }
            }
          }
        }
        if (current()) setSnapshot({ uid, conversations, names });
      } catch {
        if (current()) setError('Check your connection and messaging access, then try again.');
      } finally {
        if (current()) { setIsLoading(false); setIsRefreshing(false); }
      }
    };
    void load();
    return () => { requestRef.current++; };
  }, [session, authStatus, refreshKey]));

  const own = authStatus === 'authenticated' && session?.role === 'facilitator' && snapshot?.uid === session.uid ? snapshot : null;
  const conversations = own?.conversations ?? [];
  const visible = session ? filterConversationList(conversations, session.uid, own?.names ?? {}, search, unreadOnly) : [];
  const retry = () => setRefreshKey(value => value + 1);
  const refreshing = () => { setIsRefreshing(true); retry(); };
  const participantName = (conversation: Conversation) => {
    const id = conversation.participantIds.find(id => id !== session?.uid);
    return id ? own?.names[id] || 'Conversation' : 'Conversation';
  };

  return (
    <View style={styles.container}>
      <StudentPageBackground />
      <FlatList
        data={error || (isLoading && !isRefreshing) ? [] : visible}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshing} tintColor={colors.red} colors={[colors.red]} />}
        ListHeaderComponent={<>
          <StudentPageHeader title="Messages" subtitle="Stay connected with your students." />
          <View style={styles.controls}>
            <StudentSearchField value={search} onChangeText={setSearch} placeholder="Search students, messages..." label="Search conversations" />
            <TouchableOpacity testID="conversation-unread-filter" style={[styles.filter, unreadOnly && styles.filterSelected]} accessibilityRole="button" accessibilityLabel={unreadOnly ? 'Show all conversations' : 'Show unread conversations'} accessibilityState={{ selected: unreadOnly }} onPress={() => setUnreadOnly(value => !value)}>
              <Feather name="sliders" size={20} color={unreadOnly ? colors.white : colors.crimson} />
            </TouchableOpacity>
          </View>
          {unreadOnly && <Text style={styles.filterCaption}>Unread conversations</Text>}
        </>}
        ListEmptyComponent={<View style={styles.emptyWrap}>
          {authStatus !== 'authenticated' || !session || session.role !== 'facilitator' ? <StudentPageNotice title="Sign in to view your conversations" /> : isLoading ? <StudentPageNotice title="Loading conversations..." loading /> : error ? <StudentPageNotice title="Unable to load conversations" message={error} onRetry={retry} /> : <StudentPageNotice title={search.trim() ? 'No matching conversations' : unreadOnly ? 'No unread conversations' : 'No conversations yet'} message={search.trim() || unreadOnly ? 'Try another search or show all conversations.' : 'Messaging is available after an appointment has been accepted by a facilitator.'} />}
        </View>}
        renderItem={({ item }) => {
          const name = participantName(item);
          const unread = item.unreadCount?.[session?.uid ?? ''] ?? 0;
          return (
            <TouchableOpacity testID={'conversation-card-' + item.id} style={styles.conversationCard} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={'Open conversation with ' + name + (unread > 0 ? ', ' + unread + ' unread messages' : '')} onPress={() => navigation.navigate('ConversationDetail', { conversationId: item.id })}>
              <View style={styles.avatarCircle}><Text style={styles.avatarText}>{name.charAt(0).toLocaleUpperCase()}</Text></View>
              <View style={styles.conversationInfo}>
                <Text style={styles.participantName} numberOfLines={2}>{name}</Text>
                <Text style={[styles.lastMessage, unread > 0 && styles.lastMessageUnread]} numberOfLines={2}>{item.lastMessagePreview || 'No messages yet'}</Text>
              </View>
              <View style={styles.trailing}>
                <Text style={styles.timestamp}>{conversationDateLabel(item.lastMessageAt)}</Text>
                {unread > 0 ? <View style={styles.unreadBadge}><Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text></View> : <Feather name="chevron-right" size={16} color="#A4A9B6" />}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { flexGrow: 1, paddingBottom: 112 },
  controls: { marginTop: -22, marginHorizontal: 18, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  filter: { width: 48, minHeight: 48, borderRadius: 24, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#991B1B', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  filterSelected: { backgroundColor: colors.crimson },
  filterCaption: { fontSize: 12, fontWeight: '600', color: colors.crimson, marginHorizontal: 22, marginTop: -8, marginBottom: 14 },
  conversationCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.96)', borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 22, padding: 13, marginHorizontal: 18, marginBottom: 11, minHeight: 88, shadowColor: '#991B1B', shadowOpacity: 0.035, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  avatarCircle: { width: 53, height: 53, borderRadius: 27, backgroundColor: '#DE182E', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  avatarText: { fontSize: 23, fontWeight: '700', color: '#FFFFFF' },
  conversationInfo: { flex: 1, minWidth: 0, gap: 5 },
  participantName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  lastMessage: { fontSize: 13, lineHeight: 19, color: colors.slate },
  lastMessageUnread: { color: '#52627C' },
  trailing: { maxWidth: '25%', alignItems: 'flex-end', alignSelf: 'stretch', justifyContent: 'space-between', gap: 8, paddingVertical: 3 },
  timestamp: { fontSize: 11, color: colors.slate, textAlign: 'right', flexShrink: 1 },
  unreadBadge: { minWidth: 22, minHeight: 22, borderRadius: 12, paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#DA1730' },
  unreadText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },
  emptyWrap: { paddingHorizontal: 18, paddingBottom: 18 },
});
