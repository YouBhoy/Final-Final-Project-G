import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FacilitatorMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, messagingService, userService } from '@spartan-g/shared-services';
import type { ConversationDocument } from '@spartan-g/shared-types';
import { lightColors, palette, formatTimeOnly } from '@spartan-g/shared-ui';

export function FacilitatorMessagesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FacilitatorMobileStackParamList>>();
  const session = useAuthStore((s) => s.session);

  const [conversations, setConversations] = useState<(ConversationDocument & { id: string })[]>([]);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!session) return;
    try {
      const data = await messagingService.getConversations(session.uid, session.role);
      setConversations(data);

      const names: Record<string, string> = {};
      for (const conv of data) {
        for (const participantId of conv.participantIds) {
          if (participantId !== session.uid && !names[participantId]) {
            try {
              const userDoc = await userService.getUser(participantId);
              if (userDoc) {
                names[participantId] = userDoc.displayName || 'Unknown User';
              }
            } catch { /* ignore */ }
          }
        }
      }
      setParticipantNames(names);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading) {
        loadConversations();
      }
    }, [loadConversations, isLoading]),
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = (conversationId: string) => {
    navigation.navigate('ConversationDetail', { conversationId });
  };

  const getOtherParticipantName = (conv: ConversationDocument & { id: string }): string => {
    const otherId = conv.participantIds.find(id => id !== session?.uid);
    return otherId ? participantNames[otherId] || 'Unknown User' : 'Unknown User';
  };

  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>{'\uD83D\uDCAC'}</Text>
        <Text style={styles.emptyTitle}>No conversations</Text>
        <Text style={styles.emptyDescription}>
          Conversations are created automatically when you accept an appointment request.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Conversations</Text>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={palette.spartanRed} />
        }
        renderItem={({ item }) => {
          const unreadCount = item.unreadCount?.[session?.uid ?? ''] ?? 0;
          const hasUnread = unreadCount > 0;
          return (
            <TouchableOpacity
              style={[styles.conversationCard, hasUnread && styles.conversationCardUnread]}
              onPress={() => handleSelectConversation(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {getOtherParticipantName(item).charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.conversationInfo}>
                <View style={styles.conversationHeader}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[styles.participantName, hasUnread && styles.participantNameUnread]}
                      numberOfLines={1}
                    >
                      {getOtherParticipantName(item)}
                    </Text>
                    {hasUnread && (
                      <View style={styles.unreadDot}>
                        <Text style={styles.unreadDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.timestamp}>
                    {formatTimeOnly(item.lastMessageAt)}
                  </Text>
                </View>
                <Text style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]} numberOfLines={1}>
                  {item.lastMessagePreview || 'No messages yet'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: lightColors.background, padding: 24, gap: 12 },
  loadingText: { fontSize: 14, color: lightColors.textSecondary, marginTop: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: lightColors.text },
  emptyDescription: { fontSize: 14, color: lightColors.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  title: { fontSize: 22, fontWeight: '700', color: lightColors.text, padding: 16, paddingBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  conversationCardUnread: {
    backgroundColor: palette.red50,
    borderColor: palette.red200,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  conversationInfo: { flex: 1 },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, gap: 6 },
  participantName: { fontSize: 15, fontWeight: '700', color: lightColors.text, flexShrink: 1 },
  participantNameUnread: { fontWeight: '800', color: palette.spartanRed },
  unreadDot: {
    backgroundColor: palette.spartanRed,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadDotText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  timestamp: { fontSize: 11, color: lightColors.textMuted },
  lastMessage: { fontSize: 13, color: lightColors.textSecondary },
  lastMessageUnread: { fontWeight: '600', color: lightColors.text },
});
