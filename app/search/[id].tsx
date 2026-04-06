import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapTilerTileMap } from '@/components/maptiler-tile-map';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { auth, db } from '../../src/services/firebaseClient';
import { getSearchById, getUserData, leaveSearch, getSearchMessages, markSearchThreadRead } from '../../src/services/userService';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
const petImageSources: Record<string, any> = {
  'Rigby.jpg': require('../../assets/pets/Rigby.jpg'),
  'Taz.jpg': require('../../assets/pets/Taz.jpg'),
};

function getConfidenceColor(confidence: number) {
  const value = Number(confidence);
  if (value <= 1) {
    return '#d64545';
  }

  if (value === 2) {
    return '#e67e22';
  }

  if (value === 3) {
    return '#f1c40f';
  }

  if (value === 4) {
    return '#6ab04c';
  }

  return '#2ecc71';
}

function getConfidenceTextColor(confidence: number) {
  const value = Number(confidence);
  return value === 3 ? '#2b2b2b' : '#ffffff';
}

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

export default function SearchDetailScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [search, setSearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [relativeTimeTick, setRelativeTimeTick] = useState(Date.now());
  const [currentUserId, setCurrentUserId] = useState('');
  const [leavingSearch, setLeavingSearch] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [messagesExpanded, setMessagesExpanded] = useState(false);
  const [sightingsExpanded, setSightingsExpanded] = useState(true);
  const [searchersExpanded, setSearchersExpanded] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setRelativeTimeTick(Date.now());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const loadSearch = useCallback(async () => {
    if (!id) {
      setError('Search id is missing.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const signedInEmail = auth.currentUser?.email;
      if (!signedInEmail) {
        setError('Sign in to view this search.');
        return;
      }

      const [searchData, account, messagesData] = await Promise.all([
        getSearchById(db, id),
        getUserData(db, signedInEmail),
        getSearchMessages(db, id),
      ]);
      if (!searchData) {
        setError('Search not found.');
        setSearch(null);
        return;
      }

      setCurrentUserId(account?.id || '');
      setSearch(searchData);
      setMessages(messagesData || []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load search details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadSearch();
  }, [loadSearch]);

  useFocusEffect(
    useCallback(() => {
      void loadSearch();
    }, [loadSearch])
  );

  const center = search?.Location ?? search?.location;
  const radiusValue = Number(search?.Radius ?? search?.radius);
  const hasValidRadius = Number.isFinite(radiusValue) && radiusValue > 0;
  const radiusMiles = hasValidRadius ? radiusValue : 0;
  const showMap = Boolean(center?.latitude && center?.longitude && hasValidRadius && MAPTILER_KEY && !loading && !error);
  const searcherIds = Array.isArray(search?.searchers)
    ? search.searchers
    : Array.isArray(search?.Searchers)
    ? search.Searchers
    : [];
  const ownerId = search?.owner ?? search?.OwnerID;
  const canAddSighting = Boolean(currentUserId && ownerId && (currentUserId === ownerId || searcherIds.includes(currentUserId)));
  const canLeaveSearch = Boolean(currentUserId && ownerId && currentUserId !== ownerId && searcherIds.includes(currentUserId));
  const sightingsWithIndex = Array.isArray(search?.sightings)
    ? (() => {
        const chronological = [...search.sightings].sort(
          (a: any, b: any) => toMillis(a?.createdAt ?? a?.createdAtMs) - toMillis(b?.createdAt ?? b?.createdAtMs)
        );

        const markerIndexById = new Map<string, number>();
        chronological.forEach((sighting: any, index: number) => {
          markerIndexById.set(sighting.id, index + 1);
        });

        return search.sightings.map((sighting: any) => ({
          ...sighting,
          markerIndex: markerIndexById.get(sighting.id) ?? 0,
        }));
      })()
    : [];
  const sightingMarkers = sightingsWithIndex
    ? sightingsWithIndex.map((sighting: any) => ({
        id: sighting.id,
        latitude: sighting.latitude,
        longitude: sighting.longitude,
        label: String(sighting.markerIndex),
        color: getConfidenceColor(sighting.confidence),
        textColor: getConfidenceTextColor(sighting.confidence),
      }))
    : [];
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const latestMessageSenderId = latestMessage?.senderId ?? latestMessage?.SenderID ?? '';
  const messageReadAt = search?.MessageReadAt || {};
  const currentUserReadAtMs = toMillis(messageReadAt[currentUserId]);
  const latestMessageAtMs = toMillis(latestMessage?.createdAt);
  const hasUnreadMessages = Boolean(
    !messagesExpanded &&
      latestMessage &&
      latestMessageAtMs > currentUserReadAtMs &&
      latestMessageSenderId &&
      currentUserId &&
      latestMessageSenderId !== currentUserId
  );

  const formatTimeSinceSearch = (searchDate: any) => {
    if (!searchDate) {
      return 'Search active';
    }

    let timestampMs = 0;
    if (typeof searchDate?.toDate === 'function') {
      timestampMs = searchDate.toDate().getTime();
    } else if (searchDate instanceof Date) {
      timestampMs = searchDate.getTime();
    } else if (typeof searchDate === 'number') {
      timestampMs = searchDate;
    } else {
      const parsed = new Date(searchDate).getTime();
      timestampMs = Number.isFinite(parsed) ? parsed : 0;
    }

    if (!timestampMs) {
      return 'Search active';
    }

    const elapsedMinutes = Math.max(0, Math.floor((relativeTimeTick - timestampMs) / 60000));
    if (elapsedMinutes < 60) {
      return `${Math.max(1, elapsedMinutes)}m active`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return `${elapsedHours}h active`;
    }

    const elapsedDays = Math.floor(elapsedHours / 24);
    return `${elapsedDays}d active`;
  };

  const formatRelativeTime = (value: any) => {
    if (!value) {
      return 'Just now';
    }

    let timestampMs = 0;
    if (typeof value?.toDate === 'function') {
      timestampMs = value.toDate().getTime();
    } else if (value instanceof Date) {
      timestampMs = value.getTime();
    } else if (typeof value === 'number') {
      timestampMs = value;
    } else {
      const parsed = new Date(value).getTime();
      timestampMs = Number.isFinite(parsed) ? parsed : 0;
    }

    if (!timestampMs) {
      return 'Just now';
    }

    const minutes = Math.max(1, Math.floor((relativeTimeTick - timestampMs) / 60000));
    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const handleLeaveSearch = async () => {
    if (!id) {
      return;
    }

    try {
      setLeavingSearch(true);
      await leaveSearch(db, id, auth.currentUser?.email ?? '');
      router.replace('/(tabs)/map' as any);
    } catch (leaveError: any) {
      Alert.alert('Leave failed', leaveError?.message || 'Unable to leave this search right now.');
    } finally {
      setLeavingSearch(false);
    }
  };

  const handleToggleMessages = async () => {
    const nextExpanded = !messagesExpanded;
    setMessagesExpanded(nextExpanded);

    if (!nextExpanded || !id || !currentUserId) {
      return;
    }

    try {
      await markSearchThreadRead(db, id, currentUserId);
      setSearch((prev: any) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          MessageReadAt: {
            ...(prev.MessageReadAt || {}),
            [currentUserId]: new Date(),
          },
        };
      });
    } catch {
      // Keep UI responsive even if read receipt update fails.
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <ThemedView style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.surface }]}>
        <TouchableOpacity
          style={[styles.backButton, styles.minTouchTarget]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen">
          <IconSymbol size={18} name="chevron.right" color="#ffffff" style={styles.backIcon} />
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title" style={styles.headerTitle}>Search Details</ThemedText>
      </ThemedView>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator size="large" color={palette.primary} />
        ) : error ? (
          <View style={styles.placeholderBox}>
            <ThemedText style={styles.placeholderTitle}>Search Unavailable</ThemedText>
            <ThemedText style={styles.placeholderText}>{error}</ThemedText>
          </View>
        ) : search ? (
          <>
            <View style={[styles.petCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <ThemedText style={styles.petName}>{search?.pet?.Name || 'Unnamed pet'}</ThemedText>
              <ThemedText style={styles.searchAge}>{formatTimeSinceSearch(search?.Date ?? search?.date)}</ThemedText>

              <View style={styles.petRow}>
                {search?.pet?.Image ? (
                  <Image
                    source={
                      search.pet.Image.startsWith('http')
                        ? { uri: search.pet.Image }
                        : petImageSources[search.pet.Image] || require('../../assets/pets/Default.jpg')
                    }
                    style={styles.petImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.petImagePlaceholder}>
                    <ThemedText style={styles.petImageText}>No image</ThemedText>
                  </View>
                )}

                <View style={styles.petDetails}>
                  <ThemedText>Breed: {search?.pet?.Breed ?? 'Unknown'}</ThemedText>
                  <ThemedText>Color: {Array.isArray(search?.pet?.Color) ? search.pet.Color.join(', ') : search?.pet?.Color ?? 'Unknown'}</ThemedText>
                  <ThemedText>Size: {search?.pet?.Size ?? 'Unknown'}</ThemedText>
                  <ThemedText>Search radius: {hasValidRadius ? `${radiusMiles} miles` : 'Not set'}</ThemedText>
                  <ThemedText>Status: {search?.status ?? search?.Status ?? 'Unknown'}</ThemedText>
                </View>
              </View>
            </View>

            <View style={styles.mapSection}>
              <ThemedText type="subtitle" style={[styles.sectionTitle, { color: palette.text }]}>Search Area</ThemedText>
              {canAddSighting ? (
                <TouchableOpacity
                  style={[styles.addSightingButton, styles.minTouchTarget, { backgroundColor: palette.primary }]}
                  onPress={() => router.push({ pathname: '/search/[id]/sighting', params: { id } } as any)}
                  accessibilityRole="button"
                  accessibilityLabel="Add a sighting"
                  accessibilityHint="Opens the form to submit a sighting">
                  <ThemedText style={styles.addSightingButtonText}>Add Sighting</ThemedText>
                </TouchableOpacity>
              ) : null}
              {canLeaveSearch ? (
                <TouchableOpacity
                  style={[styles.leaveSearchButton, styles.minTouchTarget, { backgroundColor: palette.danger }]}
                  onPress={handleLeaveSearch}
                  disabled={leavingSearch}
                  accessibilityRole="button"
                  accessibilityLabel="Leave search"
                  accessibilityHint="Removes you from this active search">
                  <ThemedText style={styles.leaveSearchButtonText}>{leavingSearch ? 'Leaving...' : 'Leave Search'}</ThemedText>
                </TouchableOpacity>
              ) : null}
              {showMap ? (
                <View style={styles.mapWidget}>
                  <MapTilerTileMap
                    center={{ latitude: center.latitude, longitude: center.longitude }}
                    radiusMiles={radiusMiles}
                    apiKey={MAPTILER_KEY!}
                    zoom={12}
                    styleId="streets-v4"
                    radiusFillColor="rgba(0, 102, 255, 0.10)"
                    radiusBorderColor="rgba(0, 102, 255, 0.38)"
                    centerMarker="house"
                    centerMarkerColor={palette.primary}
                    markers={sightingMarkers}
                    containerStyle={styles.mapTilesLayer}
                  />

                  <View style={styles.mapMetaCard}>
                    <ThemedText style={styles.metaText}>Center: {center.latitude.toFixed(6)}, {center.longitude.toFixed(6)}</ThemedText>
                    <ThemedText style={styles.metaText}>Radius: {radiusMiles} miles</ThemedText>
                    <ThemedText style={styles.metaText}>Sightings: {sightingsWithIndex.length}</ThemedText>
                  </View>
                </View>
              ) : (
                <View style={styles.placeholderBox}>
                  <ThemedText style={styles.placeholderTitle}>Map Unavailable</ThemedText>
                  <ThemedText style={styles.placeholderText}>This search is missing a valid location/radius or the MapTiler key is missing.</ThemedText>
                </View>
              )}

              <View style={styles.sightingsContainer}>
                <TouchableOpacity
                  style={[styles.sightingsHeaderButton, sightingsExpanded && styles.sightingsHeaderButtonExpanded]}
                  onPress={() => setSightingsExpanded((prev) => !prev)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Sightings section, ${sightingsWithIndex.length} items`}
                  accessibilityState={{ expanded: sightingsExpanded }}>
                  <View style={styles.sightingsHeaderContent}>
                    <View style={styles.sightingsHeaderTextWrap}>
                      <ThemedText type="subtitle" style={styles.sectionTitle}>Sightings ({sightingsWithIndex.length})</ThemedText>
                      {!sightingsExpanded ? <ThemedText style={styles.sightingsHintText}>Tap to expand</ThemedText> : null}
                    </View>
                    <View style={styles.sightingsChevronWrap}>
                      <IconSymbol
                        size={18}
                        name="chevron.right"
                        color={palette.primary}
                        style={sightingsExpanded ? styles.sightingsChevronIconExpanded : undefined}
                      />
                    </View>
                  </View>
                </TouchableOpacity>

                {sightingsExpanded ? (
                  <View style={styles.sightingsSection}>
                    {sightingsWithIndex.length === 0 ? (
                      <View style={styles.sightingCard}>
                        <ThemedText style={styles.sightingTitle}>No Sightings Yet</ThemedText>
                        <ThemedText style={styles.sightingDetails}>When joined searchers report sightings, they will appear on the map as numbered markers here.</ThemedText>
                      </View>
                    ) : (
                      <View style={styles.sightingTilesSection}>
                        {sightingsWithIndex.map((sighting: any) => {
                          return (
                            <View
                              key={sighting.id}
                              style={styles.sightingTile}>
                              <View style={[styles.sightingTileBadge, { backgroundColor: getConfidenceColor(sighting.confidence) }]}>
                                <ThemedText style={[styles.sightingTileBadgeText, { color: getConfidenceTextColor(sighting.confidence) }]}>{sighting.markerIndex}</ThemedText>
                              </View>
                              <ThemedText style={[styles.sightingTileTitle, { color: palette.text }]}>Sighting #{sighting.markerIndex}</ThemedText>
                              <ThemedText style={styles.sightingTileMeta}>Reported by {sighting.reporterName} • {formatRelativeTime(sighting.createdAt)}</ThemedText>
                              <ThemedText style={styles.sightingTileMeta}>Confidence: {sighting.confidence}/5 • {sighting.latitude.toFixed(5)}, {sighting.longitude.toFixed(5)}</ThemedText>
                              {sighting.details ? (
                                <ThemedText style={styles.sightingTileDetails}>{sighting.details}</ThemedText>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.messagesContainer}>
              <TouchableOpacity
                style={[styles.messagesHeaderButton, messagesExpanded && styles.messagesHeaderButtonExpanded, styles.minTouchTarget]}
                onPress={handleToggleMessages}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Messages section, ${messages.length} messages${hasUnreadMessages ? ', unread messages' : ''}`}
                accessibilityState={{ expanded: messagesExpanded }}>
                <View style={styles.messagesHeaderContent}>
                  <View style={styles.messagesHeaderTextWrap}>
                    <ThemedText type="subtitle" style={styles.sectionTitle}>Messages ({messages.length})</ThemedText>
                    {!messagesExpanded ? <ThemedText style={styles.messagesHintText}>Tap to expand</ThemedText> : null}
                  </View>
                  <View style={styles.messagesChevronWrap}>
                    <IconSymbol
                      size={18}
                      name="chevron.right"
                      color={palette.primary}
                      style={messagesExpanded ? styles.messagesChevronIconExpanded : undefined}
                    />
                    {hasUnreadMessages ? <View style={styles.messagesUnreadBadge} /> : null}
                  </View>
                </View>
              </TouchableOpacity>

              {messagesExpanded ? (
                <View style={styles.messagesSection}>
                  {messages.length === 0 ? (
                    <ThemedText style={styles.placeholderText}>No messages for this search yet.</ThemedText>
                  ) : (
                    messages.map((message: any) => {
                      const messageSenderId = message.senderId ?? message.SenderID ?? '';
                      const isOwnMessage = Boolean(currentUserId && messageSenderId && messageSenderId === currentUserId);
                      return (
                        <View key={message.id} style={[styles.messageRow, isOwnMessage ? styles.messageRowOwn : styles.messageRowOther]}>
                          <View style={[styles.messageBubble, isOwnMessage ? styles.messageBubbleOwn : styles.messageBubbleOther]}>
                            <View style={[styles.messageHeader, isOwnMessage ? styles.messageHeaderOwn : styles.messageHeaderOther]}>
                              <ThemedText style={styles.messageSender}>{message.senderName}</ThemedText>
                              <ThemedText style={styles.messageTime}>{formatRelativeTime(message.createdAt)}</ThemedText>
                            </View>
                            <ThemedText style={[styles.messageText, isOwnMessage && styles.messageTextOwn]}>{message.text}</ThemedText>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.searchersContainer}>
              <TouchableOpacity
                style={[styles.searchersHeaderButton, searchersExpanded && styles.searchersHeaderButtonExpanded, styles.minTouchTarget]}
                onPress={() => setSearchersExpanded((prev) => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Joined searchers section, ${Array.isArray(search?.searcherNames) ? search.searcherNames.length : 0} members`}
                accessibilityState={{ expanded: searchersExpanded }}>
                <View style={styles.searchersHeaderContent}>
                  <View style={styles.searchersHeaderTextWrap}>
                    <ThemedText type="subtitle" style={styles.sectionTitle}>Joined Searchers ({Array.isArray(search?.searcherNames) ? search.searcherNames.length : 0})</ThemedText>
                    {!searchersExpanded ? <ThemedText style={styles.searchersHintText}>Tap to expand</ThemedText> : null}
                  </View>
                  <View style={styles.searchersChevronWrap}>
                    <IconSymbol
                      size={18}
                      name="chevron.right"
                      color={palette.primary}
                      style={searchersExpanded ? styles.searchersChevronIconExpanded : undefined}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {searchersExpanded ? (
                <View style={styles.searchersSection}>
                  {Array.isArray(search?.searcherNames) && search.searcherNames.length > 0 ? (
                    search.searcherNames.map((name: string, index: number) => (
                      <ThemedText key={`${name}-${index}`} style={styles.searcherNameText}>{index + 1}. {name}</ThemedText>
                    ))
                  ) : (
                    <ThemedText style={styles.placeholderText}>No one has joined this search yet.</ThemedText>
                  )}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    gap: 10,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#3d3d3d',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  minTouchTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  backIcon: {
    transform: [{ rotate: '180deg' }],
    marginRight: 4,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  petCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#BFCECF',
    borderWidth: 1,
    borderColor: '#7a8a8f',
  },
  petName: {
    fontWeight: 'bold',
    fontSize: 22,
    color: '#2B3A4A',
    marginBottom: 10,
  },
  searchAge: {
    fontSize: 12,
    color: '#0a5df0',
    fontWeight: '700',
    marginBottom: 10,
  },
  petRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  petImage: {
    width: 120,
    height: 120,
    borderRadius: 10,
  },
  petImagePlaceholder: {
    width: 120,
    height: 120,
    backgroundColor: '#D9DDE0',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  petImageText: {
    color: '#4E5B63',
    fontSize: 14,
  },
  petDetails: {
    flex: 1,
    gap: 4,
  },
  mapSection: {
    gap: 10,
  },
  addSightingButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0a5df0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addSightingButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  leaveSearchButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#7b2d20',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  leaveSearchButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  searchersContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  searchersHeaderButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8dcf0',
    backgroundColor: '#eef6ff',
  },
  searchersHeaderButtonExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  searchersHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchersHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  searchersHintText: {
    fontSize: 12,
    color: '#4f6b82',
    fontWeight: '600',
  },
  searchersChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#dcebfb',
    borderWidth: 1,
    borderColor: '#b8d4f0',
  },
  searchersChevronIconExpanded: {
    transform: [{ rotate: '-90deg' }],
  },
  searchersSection: {
    gap: 8,
    padding: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#d1e0f0',
    backgroundColor: '#f0f7ff',
  },
  searcherNameText: {
    fontSize: 14,
    color: '#1d3348',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  mapWidget: {
    width: '100%',
    height: 380,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#b8c6d3',
    backgroundColor: '#dfeaf2',
  },
  mapTilesLayer: {
    width: '100%',
    height: '100%',
  },
  mapMetaCard: {
    position: 'absolute',
    left: 10,
    width: '33%',
    bottom: 10,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  metaText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#1d3348',
  },
  sightingCard: {
    gap: 4,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1c38a',
    backgroundColor: '#fff7ea',
  },
  sightingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5b3c00',
  },
  sightingMeta: {
    fontSize: 12,
    color: '#6d5331',
    lineHeight: 16,
  },
  sightingDetails: {
    fontSize: 13,
    lineHeight: 18,
    color: '#3b3226',
  },
  sightingTilesSection: {
    gap: 10,
  },
  sightingTile: {
    position: 'relative',
    gap: 2,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7e3ee',
    backgroundColor: '#f7fbff',
  },
  sightingTileBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f59f00',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  sightingTileBadgeText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  sightingTileTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#21384e',
    paddingRight: 32,
  },
  sightingTileMeta: {
    fontSize: 11,
    color: '#4e667c',
    lineHeight: 15,
  },
  sightingTileDetails: {
    fontSize: 12,
    lineHeight: 16,
    color: '#1d3348',
    marginTop: 2,
  },
  sightingsContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  sightingsHeaderButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bdd5eb',
    backgroundColor: '#e7f2fc',
  },
  sightingsHeaderButtonExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  sightingsHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sightingsHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  sightingsHintText: {
    fontSize: 12,
    color: '#4f6b82',
    fontWeight: '600',
  },
  sightingsChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#d7e8f8',
    borderWidth: 1,
    borderColor: '#b7d0e8',
  },
  sightingsChevronIconExpanded: {
    transform: [{ rotate: '-90deg' }],
  },
  sightingsSection: {
    gap: 8,
    padding: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#cbe0f2',
    backgroundColor: '#edf6fe',
  },
  placeholderBox: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d3d9df',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  placeholderText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  messagesHeaderButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c8dcf0',
    backgroundColor: '#eef6ff',
  },
  messagesContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  messagesHeaderButtonExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  messagesHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  messagesHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  messagesHintText: {
    fontSize: 12,
    color: '#4f6b82',
    fontWeight: '600',
  },
  messagesChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#dcebfb',
    borderWidth: 1,
    borderColor: '#b8d4f0',
  },
  messagesChevronIconExpanded: {
    transform: [{ rotate: '-90deg' }],
  },
  messagesUnreadBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d64545',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  messagesSection: {
    gap: 8,
    padding: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#d1e0f0',
    backgroundColor: '#f0f7ff',
  },
  messageRow: {
    width: '100%',
  },
  messageRowOwn: {
    alignItems: 'flex-end',
  },
  messageRowOther: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    gap: 4,
  },
  messageBubbleOwn: {
    backgroundColor: '#d9ebff',
    borderTopRightRadius: 6,
  },
  messageBubbleOther: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#d5e6f7',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageHeaderOwn: {
    justifyContent: 'flex-end',
  },
  messageHeaderOther: {
    justifyContent: 'flex-start',
  },
  messageSender: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0a5df0',
  },
  messageTime: {
    fontSize: 11,
    color: '#7a8fa3',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#1d3348',
  },
  messageTextOwn: {
    textAlign: 'right',
  },
});