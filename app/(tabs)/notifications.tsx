import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import {
  clearNotificationCenterItems,
  NotificationCenterItem,
  subscribeNotificationCenter,
} from '../../src/services/notificationCenter';

function formatRelativeTime(createdAtMs: number) {
  const diffMinutes = Math.max(1, Math.floor((Date.now() - createdAtMs) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getTypeBadgeText(type: NotificationCenterItem['type']) {
  switch (type) {
    case 'nearby-search':
      return 'Nearby Search';
    case 'search-message':
      return 'Message';
    case 'search-sighting':
      return 'Sighting';
    case 'nearby-sighting':
      return 'Nearby Sighting';
    default:
      return 'Alert';
  }
}

export default function NotificationsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const [items, setItems] = useState<NotificationCenterItem[]>([]);

  useEffect(() => {
    return subscribeNotificationCenter((nextItems) => {
      setItems(nextItems);
    });
  }, []);

  const emptyStateStyle = useMemo(
    () => ({ borderColor: palette.border, backgroundColor: palette.surfaceMuted }),
    [palette.border, palette.surfaceMuted]
  );
  const cardStyle = useMemo(
    () => ({ borderColor: palette.border, backgroundColor: palette.surface }),
    [palette.border, palette.surface]
  );

  const openLinkedSearch = (searchId?: string) => {
    if (!searchId) {
      return;
    }

    router.push({ pathname: '/search/[id]', params: { id: searchId } } as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <ThemedView style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.surface }]}>
        <View style={styles.headerTextWrap}>
          <ThemedText type="title" style={styles.headerTitle}>Notifications</ThemedText>
          <ThemedText style={[styles.headerSubtitle, { color: palette.textSecondary }]}>Recent alerts about nearby activity and your searches.</ThemedText>
        </View>
        <TouchableOpacity style={styles.clearButton} onPress={clearNotificationCenterItems}>
          <ThemedText style={styles.clearButtonText}>Clear</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {items.length === 0 ? (
          <View style={[styles.emptyState, emptyStateStyle]}>
            <ThemedText style={[styles.emptyTitle, { color: palette.text }]}>No Alerts Yet</ThemedText>
            <ThemedText style={[styles.emptyBody, { color: palette.textSecondary }]}>When a nearby search is created or activity happens on searches you follow, alerts will appear here.</ThemedText>
          </View>
        ) : (
          items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, cardStyle]}
              activeOpacity={0.9}
              onPress={() => openLinkedSearch(item.searchId)}>
              <View style={styles.cardHeader}>
                <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
                <ThemedText style={[styles.cardTime, { color: palette.textSecondary }]}>{formatRelativeTime(item.createdAtMs)}</ThemedText>
              </View>
              <ThemedText style={[styles.cardBody, { color: palette.text }]}>{item.body}</ThemedText>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <ThemedText style={styles.badgeText}>{getTypeBadgeText(item.type)}</ThemedText>
                </View>
                {item.searchId ? <ThemedText style={[styles.linkText, { color: palette.primary }]}>Open Search</ThemedText> : null}
              </View>
            </TouchableOpacity>
          ))
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
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  headerTextWrap: {
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  clearButton: {
    backgroundColor: '#0a5df0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  clearButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  cardTime: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#E8F1FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A4C8E',
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
