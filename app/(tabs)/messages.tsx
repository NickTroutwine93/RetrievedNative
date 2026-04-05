import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { auth, db } from '../../src/services/firebaseClient';
import { subscribeUserMessageThreads } from '../../src/services/userService';

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

function formatRelativeTime(value: any) {
  const timestamp = toMillis(value);
  if (!timestamp) {
    return 'No activity yet';
  }

  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function MessagesScreen() {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  const ownThreads = currentUserId ? threads.filter((thread) => thread.ownerId === currentUserId) : [];
  const joinedThreads = currentUserId ? threads.filter((thread) => thread.ownerId !== currentUserId) : [];

  const renderThreadCards = (items: any[]) => {
    if (items.length === 0) {
      return null;
    }

    return items.map((thread) => {
      const isOwner = currentUserId && thread.ownerId === currentUserId;
      const participants = isOwner
        ? thread.searcherNames?.length
          ? thread.searcherNames.join(', ')
          : 'No active searchers yet'
        : thread.ownerName || 'Pet owner';

      return (
        <TouchableOpacity
          key={thread.searchId}
          style={styles.threadCard}
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: '/messages/[id]', params: { id: thread.searchId } } as any)}>
          <View style={styles.threadHeaderRow}>
            <ThemedText style={styles.petName}>{thread?.pet?.Name || 'Unnamed pet'}</ThemedText>
            <View style={styles.threadMetaColumn}>
              <ThemedText style={styles.timeText}>{formatRelativeTime(thread?.lastMessage?.createdAt || thread?.lastActivityMs)}</ThemedText>
              {thread.unreadCount > 0 ? (
                <View style={styles.unreadPill}>
                  <ThemedText style={styles.unreadPillText}>New</ThemedText>
                </View>
              ) : null}
            </View>
          </View>

          <ThemedText style={styles.participantText}>
            {isOwner ? 'Searchers: ' : 'Owner: '}
            {participants}
          </ThemedText>

          <ThemedText style={styles.previewText} numberOfLines={2}>
            {thread?.lastMessage?.Text || 'No messages yet. Tap to start the chat.'}
          </ThemedText>
        </TouchableOpacity>
      );
    });
  };

  const startLiveThreads = useCallback(async () => {
    setLoading(true);
    setError('');

    const signedInEmail = auth.currentUser?.email;
    if (!signedInEmail) {
      setThreads([]);
      setCurrentUserId('');
      setLoading(false);
      return () => {};
    }

    const unsubscribe = await subscribeUserMessageThreads(
      db,
      signedInEmail,
      (threadData: any[], userId: string | null) => {
        setThreads(threadData);
        setCurrentUserId(userId || '');
        setLoading(false);
      },
      (err: any) => {
        setError(err?.message || 'Unable to load your messages right now.');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    void startLiveThreads().then((nextUnsubscribe) => {
      if (!mounted) {
        nextUnsubscribe();
        return;
      }

      unsubscribe = nextUnsubscribe;
    });

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [startLiveThreads]);

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>Messages</ThemedText>
        <ThemedText style={styles.headerSubtitle}>Chat with owners and active searchers for live pet searches.</ThemedText>
      </ThemedView>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator size="large" color="#0076C0" />
        ) : error ? (
          <View style={styles.emptyStateBox}>
            <ThemedText style={styles.emptyStateTitle}>Could Not Load Conversations</ThemedText>
            <ThemedText style={styles.emptyStateBody}>{error}</ThemedText>
          </View>
        ) : threads.length === 0 ? (
          <View style={styles.emptyStateBox}>
            <ThemedText style={styles.emptyStateTitle}>No Conversations Yet</ThemedText>
            <ThemedText style={styles.emptyStateBody}>Join an active search in your area or start a search from Home. Threads will appear here automatically.</ThemedText>
          </View>
        ) : (
          <>
            <View style={styles.sectionBlock}>
              <ThemedText style={styles.sectionHeader}>Your Pets</ThemedText>
              {ownThreads.length === 0 ? (
                <ThemedText style={styles.emptySectionText}>No active message threads for searches you started.</ThemedText>
              ) : (
                renderThreadCards(ownThreads)
              )}
            </View>

            <View style={styles.sectionBlock}>
              <ThemedText style={styles.sectionHeader}>Searches Joined</ThemedText>
              {joinedThreads.length === 0 ? (
                <ThemedText style={styles.emptySectionText}>No message threads from joined searches yet.</ThemedText>
              ) : (
                renderThreadCards(joinedThreads)
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  headerSubtitle: {
    color: '#4b5a63',
    fontSize: 13,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  sectionBlock: {
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2B3A4A',
    marginBottom: 10,
  },
  emptySectionText: {
    fontSize: 14,
    color: '#4E5B63',
    marginBottom: 8,
  },
  emptyStateBox: {
    borderWidth: 1,
    borderColor: '#c8d1d8',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#eef3f7',
  },
  emptyStateTitle: {
    fontWeight: '800',
    color: '#30414f',
    marginBottom: 8,
  },
  emptyStateBody: {
    color: '#4d5f6f',
    lineHeight: 20,
  },
  threadCard: {
    borderWidth: 1,
    borderColor: '#7a8a8f',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#BFCECF',
  },
  threadHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  threadMetaColumn: {
    alignItems: 'flex-end',
    gap: 6,
  },
  petName: {
    fontWeight: '800',
    fontSize: 20,
    color: '#2B3A4A',
    flexShrink: 1,
  },
  timeText: {
    color: '#37536B',
    fontWeight: '700',
    fontSize: 12,
  },
  unreadPill: {
    backgroundColor: '#1f4f8f',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  unreadPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  participantText: {
    color: '#37536B',
    fontSize: 13,
    marginBottom: 8,
  },
  previewText: {
    color: '#2f4557',
    fontSize: 14,
    lineHeight: 20,
  },
});
