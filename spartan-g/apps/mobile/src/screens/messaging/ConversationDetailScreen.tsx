import { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList, FacilitatorMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, messagingService, userService } from '@spartan-g/shared-services';
import type { MessageDocument } from '@spartan-g/shared-types';
import { lightColors, formatTimeOnly } from '@spartan-g/shared-ui';

type ConversationDetailRouteProp = RouteProp<
  StudentMobileStackParamList & FacilitatorMobileStackParamList,
  'ConversationDetail'
>;

export function ConversationDetailScreen() {
  const route = useRoute<ConversationDetailRouteProp>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const session = useAuthStore((s) => s.session);
  const { conversationId } = route.params;

  const [messages, setMessages] = useState<(MessageDocument & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [inputText, setInputText] = useState('');
  const [participantName, setParticipantName] = useState('Conversation');
  const flatListRef = useRef<FlatList>(null);

  // Mark conversation as read when the screen gains focus
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      messagingService.markConversationAsRead(conversationId, session.uid, session.role).catch(() => {
        // Silently fail — unread count will update on next focus
      });
    }, [conversationId, session]),
  );

  useEffect(() => {
    if (!session) return;

    // Subscribe to real-time messages
    const unsubscribe = messagingService.subscribeToMessages(
      conversationId,
      session.role,
      (updatedMessages) => {
        setMessages(updatedMessages);
        setIsLoading(false);
      },
    );

    // Load participant name from the conversation
    const loadParticipantName = async () => {
      try {
        const conversations = await messagingService.getConversations(session.uid, session.role);
        const conv = conversations.find(c => c.id === conversationId);
        if (conv) {
          const otherId = conv.participantIds.find(id => id !== session.uid);
          if (otherId) {
            const userDoc = await userService.getUser(otherId);
            if (userDoc) {
              setParticipantName(userDoc.displayName || 'Unknown User');
              navigation.setOptions({ title: userDoc.displayName || 'Conversation' });
            }
          }
        }
      } catch { /* ignore */ }
    };
    loadParticipantName();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [conversationId, session]);

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !session || isSending) return;

    setIsSending(true);
    setInputText('');
    try {
      await messagingService.sendMessage(conversationId, session.uid, trimmed, session.role);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = ({ item }: { item: MessageDocument & { id: string } }) => {
    const isCurrentUser = item.senderId === session?.uid;
    return (
      <View style={[styles.messageRow, isCurrentUser ? styles.messageRowSent : styles.messageRowReceived]}>
        <View
          style={[
            styles.messageBubble,
            isCurrentUser ? styles.sentBubble : styles.receivedBubble,
          ]}
        >
          <Text style={[styles.messageText, isCurrentUser ? styles.sentText : styles.receivedText]}>
            {item.body}
          </Text>
          <Text style={[styles.messageTime, isCurrentUser ? styles.sentTime : styles.receivedTime]}>
            {formatTimeOnly(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        renderItem={renderMessage}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDCAC'}</Text>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyDescription}>
              Start the conversation by sending a message below.
            </Text>
          </View>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor={lightColors.textMuted}
          multiline
          maxLength={4000}
          editable={!isSending}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isSending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isSending}
          activeOpacity={0.7}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: lightColors.background, padding: 24, gap: 12 },
  loadingText: { fontSize: 14, color: lightColors.textSecondary, marginTop: 8 },
  messagesList: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  messageRow: { marginBottom: 12 },
  messageRowSent: { alignItems: 'flex-end' },
  messageRowReceived: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  sentBubble: { backgroundColor: lightColors.primary, borderBottomRightRadius: 4 },
  receivedBubble: { backgroundColor: lightColors.surface, borderWidth: 1, borderColor: lightColors.border, borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  sentText: { color: '#FFFFFF' },
  receivedText: { color: lightColors.text },
  messageTime: { fontSize: 11, marginTop: 4 },
  sentTime: { color: 'rgba(255,255,255,0.7)' },
  receivedTime: { color: lightColors.textMuted },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: lightColors.text },
  emptyDescription: { fontSize: 14, color: lightColors.textSecondary, textAlign: 'center', lineHeight: 20 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: lightColors.border,
    backgroundColor: lightColors.surface,
  },
  textInput: {
    flex: 1,
    backgroundColor: lightColors.background,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: lightColors.text,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});