import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FacilitatorMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, messagingService, userService } from '@spartan-g/shared-services';
import type { ConversationDocument } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';

function formatTime(timestamp: any): string {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function FacilitatorMessagesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FacilitatorMobileStackParamList>>();
  const session = useAuthStore((s) => s.session);

  const [conversations, setConversations] = useState<(ConversationDocument & { id: string })[]>([]);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

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
    }
  }, [session]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = (conversationId: string) => {
    navigation.navigate('ConversationDetail', { conversationId });
  };

  const getOtherParticipantName = (conv: ConversationDocument & { id: string }): string => {
    const otherId = conv.participantIds.find(id => id !== session?.uid);
    return otherId ? participantNames[otherId] || 'Unknown User' : 'Unknown User';
  };

  if (isLoading) {
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
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.conversationCard}
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
                <Text style={styles.participantName} numberOfLines={1}>
                  {getOtherParticipantName(item)}
                </Text>
                <Text style={styles.timestamp}>
                  {formatTime(item.lastMessageAt)}
                </Text>
              </View>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.lastMessagePreview || 'No messages yet'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
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
  participantName: { fontSize: 15, fontWeight: '700', color: lightColors.text, flex: 1, marginRight: 8 },
  timestamp: { fontSize: 11, color: lightColors.textMuted },
  lastMessage: { fontSize: 13, color: lightColors.textSecondary },
});