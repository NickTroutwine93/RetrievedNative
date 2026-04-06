import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { auth, db } from '../../src/services/firebaseClient';
import {
  getSearchById,
  getUserData,
  markSearchThreadRead,
  sendSearchMessage,
  subscribeToSearchMessages,
} from '../../src/services/userService';

function toMillis(value: any) {
  if (!value) {
    return 0;
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMessageTime(value: any) {
  const timestamp = toMillis(value);
  if (!timestamp) {
    return '';
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function SearchMessagesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const { id } = useLocalSearchParams<{ id?: string }>();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const backButtonDynamicStyle = { backgroundColor: palette.primaryStrong };
  const errorBoxDynamicStyle = { borderColor: palette.danger, backgroundColor: palette.surfaceMuted };
  const emptyConversationDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surfaceMuted };
  const myBubbleDynamicStyle = {
    borderColor: palette.primary,
    backgroundColor: colorScheme === 'dark' ? '#1f3650' : '#d7edf9',
  };
  const otherBubbleDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surface };
  const composerWrapDynamicStyle = { borderTopColor: palette.border, backgroundColor: palette.surface };
  const inputDynamicStyle = { borderColor: palette.border, color: palette.text, backgroundColor: palette.surfaceMuted };

  const [search, setSearch] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const senderName = useMemo(() => {
    if (!account) {
      return 'Search volunteer';
    }

    return [account.FirstName, account.LastName].filter(Boolean).join(' ').trim() || account.Email || 'Search volunteer';
  }, [account]);

  const loadContext = useCallback(async () => {
    if (!id) {
      setError('Message thread id is missing.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const signedInEmail = auth.currentUser?.email;
      if (!signedInEmail) {
        setError('Sign in to use messages.');
        return;
      }

      const user = await getUserData(db, signedInEmail);
      if (!user?.id) {
        setError('Your account profile could not be found.');
        return;
      }

      const searchData = await getSearchById(db, id);
      if (!searchData) {
        setError('This search no longer exists.');
        setSearch(null);
        return;
      }

      const ownerId = searchData.owner ?? searchData.OwnerID;
      const searcherIds = Array.isArray(searchData.searchers)
        ? searchData.searchers
        : Array.isArray(searchData.Searchers)
        ? searchData.Searchers
        : [];

      if (user.id !== ownerId && !searcherIds.includes(user.id)) {
        setError('Only the pet owner and active searchers can access this chat.');
        setSearch(null);
        return;
      }

      setAccount(user);
      setSearch(searchData);
    } catch (err: any) {
      setError(err?.message || 'Unable to load this chat.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!id || !search) {
      return;
    }

    const unsubscribe = subscribeToSearchMessages(
      db,
      id,
      (nextMessages: any[]) => {
        setMessages(nextMessages);
      },
      (subscribeError: any) => {
        setError(subscribeError?.message || 'Unable to sync messages.');
      }
    );

    return unsubscribe;
  }, [id, search]);

  useEffect(() => {
    if (!id || !account?.id) {
      return;
    }

    void markSearchThreadRead(db, id, account.id);
  }, [id, account?.id]);

  useEffect(() => {
    if (!scrollViewRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });

    if (id && account?.id) {
      void markSearchThreadRead(db, id, account.id);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!id || !account?.id || sending) {
      return;
    }

    const nextMessage = draft.trim();
    if (!nextMessage) {
      return;
    }

    try {
      setSending(true);
      await sendSearchMessage(db, {
        searchId: id,
        senderId: account.id,
        senderName,
        text: nextMessage,
      });
      setDraft('');
    } catch (err: any) {
      Alert.alert('Message failed', err?.message || 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <ThemedView style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.surface }]}>
          <TouchableOpacity
            style={[styles.backButton, backButtonDynamicStyle, styles.minTouchTarget]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the messages tab">
            <IconSymbol size={18} name="chevron.right" color={palette.onPrimary} style={styles.backIcon} />
            <ThemedText style={styles.backButtonText}>Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title" style={styles.headerTitle}>Messages</ThemedText>
          <ThemedText style={[styles.headerSubtitle, { color: palette.textSecondary }]}>{search?.pet?.Name ? `Search chat: ${search.pet.Name}` : 'Search chat'}</ThemedText>
        </ThemedView>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : error ? (
          <View style={[styles.errorBox, errorBoxDynamicStyle]}>
            <ThemedText style={[styles.errorTitle, { color: palette.danger }]}>Chat Unavailable</ThemedText>
            <ThemedText style={[styles.errorBody, { color: palette.danger }]}>{error}</ThemedText>
          </View>
        ) : (
          <>
            <ScrollView ref={scrollViewRef} style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}>
              {messages.length === 0 ? (
                <View style={[styles.emptyConversation, emptyConversationDynamicStyle]}>
                  <ThemedText style={[styles.emptyConversationTitle, { color: palette.text }]}>Start the conversation</ThemedText>
                  <ThemedText style={[styles.emptyConversationBody, { color: palette.textSecondary }]}>Share sightings, route updates, and coordination notes for this active search.</ThemedText>
                </View>
              ) : (
                messages.map((message) => {
                  const isMine = message.SenderID === account?.id;

                  return (
                    <View key={message.id} style={[styles.messageBubble, isMine ? styles.myBubble : styles.otherBubble, isMine ? myBubbleDynamicStyle : otherBubbleDynamicStyle]}>
                      <ThemedText style={[styles.senderText, { color: palette.primary }]}>{isMine ? 'You' : message.SenderName || 'Volunteer'}</ThemedText>
                      <ThemedText style={[styles.messageText, { color: palette.text }]}>{message.Text}</ThemedText>
                      <ThemedText style={[styles.timestampText, { color: palette.textSecondary }]}>{formatMessageTime(message.createdAt)}</ThemedText>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={[styles.composerWrap, composerWrapDynamicStyle]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type an update for the team"
                placeholderTextColor={palette.textMuted}
                multiline
                style={[styles.input, inputDynamicStyle]}
                editable={!sending}
                accessibilityLabel="Message input"
              />
              <TouchableOpacity
                style={[styles.sendButton, styles.minTouchTarget, { backgroundColor: palette.primary }, sending && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Send message">
                <ThemedText style={styles.sendButtonText}>{sending ? 'Sending...' : 'Send'}</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d2dbe1',
    gap: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#3d3d3d',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backIcon: {
    transform: [{ rotate: '180deg' }],
    marginRight: 4,
  },
  minTouchTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#4f6370',
    fontSize: 13,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBox: {
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d0b2b2',
    backgroundColor: '#f8ebeb',
    padding: 16,
  },
  errorTitle: {
    color: '#6c2f2f',
    fontWeight: '800',
    marginBottom: 8,
  },
  errorBody: {
    color: '#6c2f2f',
    lineHeight: 20,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 14,
    gap: 10,
  },
  emptyConversation: {
    borderWidth: 1,
    borderColor: '#c8d1d8',
    backgroundColor: '#edf3f6',
    borderRadius: 12,
    padding: 14,
  },
  emptyConversationTitle: {
    color: '#324656',
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyConversationBody: {
    color: '#4c6273',
    lineHeight: 20,
  },
  messageBubble: {
    maxWidth: '86%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  myBubble: {
    alignSelf: 'flex-end',
    borderColor: '#3e79a5',
    backgroundColor: '#d7edf9',
  },
  otherBubble: {
    alignSelf: 'flex-start',
    borderColor: '#9ab0bf',
    backgroundColor: '#f2f7fa',
  },
  senderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#385261',
    marginBottom: 4,
  },
  messageText: {
    color: '#273844',
    lineHeight: 20,
  },
  timestampText: {
    color: '#5b7383',
    fontSize: 11,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: '#d2dbe1',
    padding: 12,
    gap: 10,
    backgroundColor: '#fff',
  },
  input: {
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#abc0ce',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#22313b',
    backgroundColor: '#f8fbfd',
    textAlignVertical: 'top',
  },
  sendButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#1f4f8f',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
