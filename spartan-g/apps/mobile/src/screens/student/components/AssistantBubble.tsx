import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { lightColors, palette } from '@spartan-g/shared-ui';
import { useAuthStore, assistantGeminiClient } from '@spartan-g/shared-services';
import type { AssistantChatMessage } from '@spartan-g/shared-services';
import { navigationRef } from '../../../navigation/navigationRef';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const BUBBLE_SIZE = 60;
const MARGIN = 20;
const CHAT_WIDTH = Math.min(340, SCREEN_WIDTH - 32);
const CHAT_HEIGHT = Math.min(460, SCREEN_HEIGHT - 48);
const INITIAL_LEFT = SCREEN_WIDTH - BUBBLE_SIZE - MARGIN;
const INITIAL_TOP = SCREEN_HEIGHT - BUBBLE_SIZE - MARGIN - 110;

interface ChatBubbleMsg {
  role: 'user' | 'assistant';
  text: string;
}

export function AssistantBubble() {
  const session = useAuthStore((s) => s.session);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: INITIAL_LEFT, top: INITIAL_TOP });
  const [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState<ChatBubbleMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const startPosRef = useRef({ x: 0, y: 0 });
  const dragAccumRef = useRef(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const historyRef = useRef<AssistantChatMessage[]>([]);

  useEffect(() => {
    if (!open || !session) return;
    assistantGeminiClient
      .getRemaining(session.uid)
      .then((n) => setRemaining(n))
      .catch(() => setRemaining(null));
  }, [open, session]);

  useFocusEffect(() => {
    try {
      const route = navigationRef.current?.getCurrentRoute() as
        | { name?: string }
        | undefined;
      const onWizard = route?.name === 'AssessmentWizard';
      setHidden(onWizard);
      if (onWizard) setOpen(false);
    } catch {
      setHidden(false);
    }
  });

  const clampPosition = (left: number, top: number) => {
    const maxLeft = Math.max(0, SCREEN_WIDTH - BUBBLE_SIZE);
    const maxTop = Math.max(0, SCREEN_HEIGHT - BUBBLE_SIZE - 110);
    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  };

  const onStartShouldSetResponder = useCallback(() => true, []);
  const onMoveShouldSetResponder = useCallback(() => true, []);

  const onResponderMove = useCallback(
    (event: GestureResponderEvent) => {
      if (!dragging) {
        setDragging(true);
        startPosRef.current = {
          x: event.nativeEvent.locationX,
          y: event.nativeEvent.locationY,
        };
      }
      if (event.nativeEvent) {
        const dx = event.nativeEvent.locationX - startPosRef.current.x;
        const dy = event.nativeEvent.locationY - startPosRef.current.y;
        dragAccumRef.current = Math.abs(dx) + Math.abs(dy);
        setPosition(clampPosition(position.left + dx, position.top + dy));
      }
    },
    [dragging, position],
  );

  const onResponderRelease = useCallback(() => {
    setDragging(false);
    if (dragAccumRef.current < 8) {
      setOpen(true);
    }
    dragAccumRef.current = 0;
  }, []);

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd?.({ animated: true });
  }, []);
const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !session || loading) return;
    if (remaining !== null && remaining <= 0) {
      setBanner("Let's continue this tomorrow! You've reached today's message limit.");
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);
    setBanner(null);
    historyRef.current = [...historyRef.current, { role: 'user' as const, text: trimmed }];

    try {
      const result = await assistantGeminiClient.chatWithAssistant(
        trimmed,
        session.uid,
        historyRef.current,
      );

      if (result.status === 'ok') {
        historyRef.current = [
          ...historyRef.current,
          { role: 'model' as const, text: result.text },
        ];
        setMessages((prev) => [...prev, { role: 'assistant', text: result.text }]);
        if (typeof result.remaining === 'number') setRemaining(result.remaining);
      } else if (result.status === 'daily_limit') {
        setRemaining(0);
        setBanner("Let's continue this tomorrow! You've reached today's message limit.");
      } else if (result.status === 'unconfigured') {
        setBanner('The assistant is not available right now. Please try again later.');
      } else {
        setBanner('Something went wrong while I was thinking. Please try again.');
      }
    } catch {
      setBanner('Something went wrong while I was thinking. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [input, session, loading, remaining]);

  useEffect(() => {
    if (messages.length > 0) scrollToEnd();
  }, [messages, scrollToEnd]);
return (
    <>
      {!hidden && (
        <>
          <View
            style={[
              styles.bubble,
              { left: position.left, top: position.top, opacity: dragging ? 0.85 : 1 },
            ]}
            onStartShouldSetResponder={onStartShouldSetResponder}
            onMoveShouldSetResponder={onMoveShouldSetResponder}
            onResponderMove={onResponderMove}
            onResponderRelease={onResponderRelease}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.bubbleInner}
              onPress={() => setOpen(true)}
            >
              <Image
                source={require('../../../../assets/floating-assistant-icon.png')}
                style={styles.bubbleIcon}
              />
            </TouchableOpacity>
          </View>
        </>
      )}

      {!hidden && (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
            <View style={[styles.chatCard, { width: CHAT_WIDTH, height: CHAT_HEIGHT }]}>
              <View style={styles.chatHeader}>
                <Image
                  source={require('../../../../assets/floating-assistant-icon.png')}
                  style={styles.chatAvatar}
                />
                <Text style={styles.chatTitle}>Your Companion</Text>
                <Text style={styles.chatClose} onPress={() => setOpen(false)}>
                  ✕
                </Text>
              </View>

              <ScrollView
                style={styles.chatBody}
                ref={(r) => {
                  scrollRef.current = r;
                }}
              >
                {messages.length === 0 && (
                  <Text style={styles.chatEmpty}>
                    Hi! I'm here to help. Ask me about your appointments, assessments, unread
                    messages, or your garden — or just chat.
                  </Text>
                )}
                {messages.map((m, i) => (
                  <View
                    key={i}
                    style={m.role === 'user' ? styles.userBubble : styles.assistantRow}
                  >
                    {m.role === 'assistant' && (
                      <Image
                        source={require('../../../../assets/floating-assistant-icon.png')}
                        style={styles.msgAvatar}
                      />
                    )}
                    <View style={m.role === 'user' ? undefined : styles.assistantBubble}>
                      <Text style={m.role === 'user' ? styles.userText : styles.assistantText}>
                        {m.text}
                      </Text>
                    </View>
                  </View>
                ))}
                {loading && (
                  <View style={styles.assistantRow}>
                    <Image
                      source={require('../../../../assets/floating-assistant-icon.png')}
                      style={styles.msgAvatar}
                    />
                    <View style={styles.assistantBubble}>
                      <ActivityIndicator color={palette.spartanRed} />
                    </View>
                  </View>
                )}
              </ScrollView>

              {banner && (
                <View style={styles.chatBanner}>
                  <Text style={styles.chatBannerText}>{banner}</Text>
                </View>
              )}

              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask me anything…"
                  placeholderTextColor={lightColors.textMuted}
                  multiline
                />
                <TouchableOpacity style={styles.sendButton} onPress={send} activeOpacity={0.7}>
                  <Feather name="send" size={20} color={palette.white} />
                </TouchableOpacity>
              </View>

              {remaining !== null && (
                <Text style={styles.chatCounter}>
                  {remaining} message{remaining === 1 ? '' : 's'} left today
                </Text>
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: 60,
    height: 60,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  bubbleInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  chatCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#991B1B',
  },
  chatAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginRight: 8,
  },
  chatTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chatClose: { fontSize: 18, color: '#FFFFFF', paddingHorizontal: 4 },
  chatBody: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
  },
  chatEmpty: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
    marginHorizontal: 12,
    marginVertical: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 6,
    maxWidth: '80%',
  },
  userText: { color: '#FFFFFF', fontSize: 13 },
  assistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  msgAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },
  assistantBubble: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    maxWidth: '80%',
  },
  assistantText: { color: '#0F172A', fontSize: 13 },
  chatBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  chatBannerText: { color: '#D97706', fontSize: 12 },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chatInput: {
    flex: 1,
    maxHeight: 80,
    minHeight: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  chatCounter: {
    alignSelf: 'center',
    fontSize: 11,
    color: '#94A3B8',
    paddingVertical: 4,
  },
});
