import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
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
import { endSearch, getSearchById, getUserData, leaveSearch, markSearchThreadRead, sendSearchMessage, subscribeToSearch, subscribeToSearchMessages } from '../../src/services/userService';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
const petImageSources: Record<string, any> = {
  'Rigby.jpg': require('../../assets/pets/Rigby.jpg'),
  'Taz.jpg': require('../../assets/pets/Taz.jpg'),
};

function formatBreedLabel(value: any): string {
  if (Array.isArray(value)) {
    const breeds = value.map((breed) => String(breed).trim()).filter((breed) => breed.length > 0);
    return breeds.length > 0 ? breeds.join(', ') : 'Unknown';
  }

  const text = String(value ?? '').trim();
  return text.length > 0 ? text : 'Unknown';
}

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

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function offsetCoordinate(
  coordinate: { latitude: number; longitude: number },
  distanceMiles: number,
  bearingDegrees: number
) {
  const earthRadiusMiles = 3958.7613;
  const angularDistance = distanceMiles / earthRadiusMiles;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (coordinate.latitude * Math.PI) / 180;
  const lon1 = (coordinate.longitude * Math.PI) / 180;

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAd = Math.sin(angularDistance);
  const cosAd = Math.cos(angularDistance);

  const lat2 = Math.asin(sinLat1 * cosAd + cosLat1 * sinAd * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * sinAd * cosLat1, cosAd - sinLat1 * Math.sin(lat2));

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: ((lon2 * 180) / Math.PI + 540) % 360 - 180,
  };
}

function getObfuscatedCoordinate(
  coordinate: { latitude: number; longitude: number },
  seed: string,
  minOffsetMiles = 0.35,
  maxOffsetMiles = 0.65
) {
  const hash = hashString(seed || 'search-location');
  const bearing = hash % 360;
  const normalized = ((hash >> 8) % 1000) / 999;
  const distance = minOffsetMiles + (maxOffsetMiles - minOffsetMiles) * normalized;
  return offsetCoordinate(coordinate, distance, bearing);
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
  const [account, setAccount] = useState<any>(null);
  const [leavingSearch, setLeavingSearch] = useState(false);
  const [endingSearch, setEndingSearch] = useState(false);
  const [showEndSearchModal, setShowEndSearchModal] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [messagesExpanded, setMessagesExpanded] = useState(true);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [sightingsExpanded, setSightingsExpanded] = useState(true);
  const [lastSeenSightingAtMs, setLastSeenSightingAtMs] = useState(0);
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

      const accountData = await getUserData(db, signedInEmail);
      const searchData = await getSearchById(db, id, accountData?.id || '');
      if (!searchData) {
        setError('Search not found.');
        setSearch(null);
        return;
      }

      setCurrentUserId(accountData?.id || '');
      setAccount(accountData);
      setSearch(searchData);
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

  useEffect(() => {
    if (!id || !currentUserId) {
      return;
    }

    const unsubscribe = subscribeToSearch(
      db,
      id,
      currentUserId,
      (updatedSearch: any) => {
        if (updatedSearch) {
          setSearch(updatedSearch);
          setLoading(false);
        }
      },
    );

    return unsubscribe;
  }, [id, currentUserId]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const unsubscribe = subscribeToSearchMessages(
      db,
      id,
      (nextMessages: any[]) => {
        setMessages(nextMessages);
      },
      (subscribeError: any) => {
        // Non-fatal: keep UI usable if real-time sync fails.
      }
    );

    return unsubscribe;
  }, [id]);

  const center = search?.Location ?? search?.location;
  const radiusValue = Number(search?.Radius ?? search?.radius);
  const hasValidRadius = Number.isFinite(radiusValue) && radiusValue > 0;
  const radiusMiles = hasValidRadius ? radiusValue : 0;
  const searcherIds = Array.isArray(search?.searchers)
    ? search.searchers
    : Array.isArray(search?.Searchers)
    ? search.Searchers
    : [];
  const ownerId = search?.owner ?? search?.OwnerID;
  const isOwner = Boolean(currentUserId && ownerId && currentUserId === ownerId);
  const displayCenter = center
    ? isOwner
      ? center
      : search?.locationIsObfuscated
      ? center
      : getObfuscatedCoordinate(center, String(search?.id || id || ownerId || 'search'))
    : null;
  const showMap = Boolean(displayCenter?.latitude && displayCenter?.longitude && hasValidRadius && MAPTILER_KEY && !loading && !error);
  const canEndSearch = Boolean(currentUserId && ownerId && currentUserId === ownerId);
  const canAddSighting = Boolean(currentUserId && ownerId && (currentUserId === ownerId || searcherIds.includes(currentUserId)));
  const canLeaveSearch = Boolean(currentUserId && ownerId && currentUserId !== ownerId && searcherIds.includes(currentUserId));
  const canMessage = Boolean(currentUserId && ownerId && (currentUserId === ownerId || searcherIds.includes(currentUserId)));
  const senderName = useMemo(() => {
    if (!account) {
      return 'Search volunteer';
    }

    return [account.FirstName, account.LastName].filter(Boolean).join(' ').trim() || account.Email || 'Search volunteer';
  }, [account]);
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
  const latestSightingAtMs = sightingsWithIndex.reduce(
    (latest: number, sighting: any) => Math.max(latest, toMillis(sighting?.createdAt ?? sighting?.createdAtMs)),
    0
  );
  const hasUnreadSightings = Boolean(!sightingsExpanded && latestSightingAtMs > lastSeenSightingAtMs);
  const hasUnreadMessages = Boolean(
    !messagesExpanded &&
      latestMessage &&
      latestMessageAtMs > currentUserReadAtMs &&
      latestMessageSenderId &&
      currentUserId &&
      latestMessageSenderId !== currentUserId
  );
  const statusValue = Number(search?.status ?? search?.Status);
  const successfulValue = Number(search?.Successful ?? search?.Successfull);
  const isSearchEnded = statusValue === 0;
  const searchStatusLabel = isSearchEnded
    ? successfulValue === 1
      ? 'Ended: Pet Found'
      : successfulValue === 0
      ? 'Ended: Not Found'
      : 'Ended'
    : 'Active';
  const statusChipDynamicStyle = {
    backgroundColor: isSearchEnded ? palette.surfaceMuted : palette.surface,
    borderColor: isSearchEnded ? palette.danger : palette.success,
  };
  const sectionHeaderCardStyle = {
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
  };
  const sectionBodyCardStyle = {
    borderColor: palette.border,
    backgroundColor: palette.surface,
  };
  const sectionChevronWrapStyle = {
    backgroundColor: palette.surface,
    borderColor: palette.border,
  };
  const secondaryTextStyle = {
    color: palette.textSecondary,
  };
  const messageBubbleOwnStyle = {
    backgroundColor: colorScheme === 'dark' ? '#1f3650' : '#d9ebff',
  };
  const messageBubbleOtherStyle = {
    backgroundColor: palette.surface,
    borderColor: palette.border,
  };
  const searchInfoText = String(search?.Info ?? search?.info ?? '').trim();

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

  const runEndSearch = async (wasSuccessful: boolean) => {
    if (!id || endingSearch) {
      return;
    }

    try {
      setEndingSearch(true);
      await endSearch(db, id, wasSuccessful);
      setShowEndSearchModal(false);
      router.replace('/(tabs)/map' as any);
    } catch (endError: any) {
      Alert.alert('End search failed', endError?.message || 'Unable to end this search right now.');
    } finally {
      setEndingSearch(false);
    }
  };

  const handleEndSearch = () => {
    setShowEndSearchModal(true);
  };

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

  const handleToggleSightings = () => {
    const nextExpanded = !sightingsExpanded;
    setSightingsExpanded(nextExpanded);

    if (nextExpanded && latestSightingAtMs > 0) {
      setLastSeenSightingAtMs((prev) => Math.max(prev, latestSightingAtMs));
    }
  };

  useEffect(() => {
    if (!sightingsExpanded || latestSightingAtMs <= 0) {
      return;
    }

    setLastSeenSightingAtMs((prev) => Math.max(prev, latestSightingAtMs));
  }, [sightingsExpanded, latestSightingAtMs]);

  useEffect(() => {
    if (!messagesExpanded || !id || !currentUserId || messages.length === 0) {
      return;
    }

    const latest = messages[messages.length - 1];
    const senderId = latest?.senderId ?? latest?.SenderID ?? '';
    if (!senderId || senderId === currentUserId) {
      return;
    }

    void markSearchThreadRead(db, id, currentUserId);
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
  }, [messagesExpanded, messages, id, currentUserId]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding', default: undefined })}>
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
        {search ? (
          <View style={[styles.statusChip, statusChipDynamicStyle]}>
            <ThemedText style={styles.statusChipText}>{searchStatusLabel}</ThemedText>
          </View>
        ) : null}
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
                  <ThemedText>Breed: {formatBreedLabel(search?.pet?.Breed)}</ThemedText>
                  <ThemedText>Color: {Array.isArray(search?.pet?.Color) ? search.pet.Color.join(', ') : search?.pet?.Color ?? 'Unknown'}</ThemedText>
                  <ThemedText>Size: {search?.pet?.Size ?? 'Unknown'}</ThemedText>
                  <ThemedText>Search radius: {hasValidRadius ? `${radiusMiles} miles` : 'Not set'}</ThemedText>
                  <ThemedText>Status: {search?.status ?? search?.Status ?? 'Unknown'}</ThemedText>
                </View>
              </View>

              {searchInfoText ? (
                <View style={styles.searchInfoSection}>
                  <ThemedText style={styles.searchInfoLabel}>Info:</ThemedText>
                  <ThemedText style={styles.searchInfoText}>{searchInfoText}</ThemedText>
                </View>
              ) : null}
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
              {canEndSearch ? (
                <TouchableOpacity
                  style={[styles.endSearchButton, styles.minTouchTarget, { backgroundColor: palette.danger }]}
                  onPress={handleEndSearch}
                  disabled={endingSearch}
                  accessibilityRole="button"
                  accessibilityLabel="End search"
                  accessibilityHint="Ends this search and marks whether it was successful">
                  <ThemedText style={styles.endSearchButtonText}>{endingSearch ? 'Ending...' : 'End Search'}</ThemedText>
                </TouchableOpacity>
              ) : null}
              {showMap ? (
                <View style={styles.mapWidget}>
                  <MapTilerTileMap
                    center={{ latitude: displayCenter.latitude, longitude: displayCenter.longitude }}
                    radiusMiles={radiusMiles}
                    apiKey={MAPTILER_KEY!}
                    zoom={12}
                    maxZoom={16}
                    styleId="streets-v4"
                    radiusFillColor="rgba(0, 102, 255, 0.20)"
                    radiusBorderColor="rgba(0, 102, 255, 0.38)"
                    secondaryRadiusMiles={0.5}
                    secondaryRadiusFillColor="rgba(0, 70, 140, 0.26)"
                    secondaryRadiusBorderColor="rgba(0, 70, 140, 0.70)"
                    centerMarker="none"
                    centerMarkerColor={palette.primary}
                    markers={sightingMarkers}
                    containerStyle={styles.mapTilesLayer}
                  />

                  <View style={styles.mapMetaCard}>
                    <ThemedText style={styles.metaText}>{isOwner ? `Center: ${center.latitude.toFixed(6)}, ${center.longitude.toFixed(6)}` : 'Approximate center shown for privacy'}</ThemedText>
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
                  style={[styles.sightingsHeaderButton, sectionHeaderCardStyle, sightingsExpanded && styles.sightingsHeaderButtonExpanded]}
                  onPress={handleToggleSightings}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Sightings section, ${sightingsWithIndex.length} items${hasUnreadSightings ? ', unread sightings' : ''}`}
                  accessibilityState={{ expanded: sightingsExpanded }}>
                  <View style={styles.sightingsHeaderContent}>
                    <View style={styles.sightingsHeaderTextWrap}>
                      <ThemedText type="subtitle" style={styles.sectionTitle}>Sightings ({sightingsWithIndex.length})</ThemedText>
                      {!sightingsExpanded ? <ThemedText style={[styles.sightingsHintText, secondaryTextStyle]}>Tap to expand</ThemedText> : null}
                    </View>
                    <View style={[styles.sightingsChevronWrap, sectionChevronWrapStyle]}>
                      <IconSymbol
                        size={18}
                        name="chevron.right"
                        color={palette.primary}
                        style={sightingsExpanded ? styles.sightingsChevronIconExpanded : undefined}
                      />
                      {hasUnreadSightings ? <View style={styles.sightingsUnreadBadge} /> : null}
                    </View>
                  </View>
                </TouchableOpacity>

                {sightingsExpanded ? (
                  <View style={[styles.sightingsSection, sectionBodyCardStyle]}>
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
                style={[styles.messagesHeaderButton, sectionHeaderCardStyle, messagesExpanded && styles.messagesHeaderButtonExpanded, styles.minTouchTarget]}
                onPress={handleToggleMessages}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Messages section, ${messages.length} messages${hasUnreadMessages ? ', unread messages' : ''}`}
                accessibilityState={{ expanded: messagesExpanded }}>
                <View style={styles.messagesHeaderContent}>
                  <View style={styles.messagesHeaderTextWrap}>
                    <ThemedText type="subtitle" style={styles.sectionTitle}>Messages ({messages.length})</ThemedText>
                    {!messagesExpanded ? <ThemedText style={[styles.messagesHintText, secondaryTextStyle]}>Tap to expand</ThemedText> : null}
                  </View>
                  <View style={[styles.messagesChevronWrap, sectionChevronWrapStyle]}>
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
                <View style={[styles.messagesSection, sectionBodyCardStyle]}>
                  {messages.length === 0 ? (
                    <ThemedText style={styles.placeholderText}>No messages for this search yet.</ThemedText>
                  ) : (
                    messages.map((message: any) => {
                      const messageSenderId = message.senderId ?? message.SenderID ?? '';
                      const isOwnMessage = Boolean(currentUserId && messageSenderId && messageSenderId === currentUserId);
                      return (
                        <View key={message.id} style={[styles.messageRow, isOwnMessage ? styles.messageRowOwn : styles.messageRowOther]}>
                          <View style={[styles.messageBubble, isOwnMessage ? styles.messageBubbleOwn : styles.messageBubbleOther, isOwnMessage ? messageBubbleOwnStyle : messageBubbleOtherStyle]}>
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
                  {canMessage ? (
                    <View style={styles.composerRow}>
                      <TextInput
                        value={draft}
                        onChangeText={setDraft}
                        placeholder="Send a message to the team…"
                        placeholderTextColor={palette.textMuted}
                        multiline
                        style={[styles.composerInput, { color: palette.text }]}
                        editable={!sending}
                        accessibilityLabel="Message input"
                      />
                      <TouchableOpacity
                        style={[styles.composerSendButton, styles.minTouchTarget, { backgroundColor: palette.primary }, sending && styles.composerSendButtonDisabled]}
                        onPress={handleSend}
                        disabled={sending}
                        accessibilityRole="button"
                        accessibilityLabel="Send message">
                        <ThemedText style={styles.composerSendButtonText}>{sending ? '…' : 'Send'}</ThemedText>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={styles.searchersContainer}>
              <TouchableOpacity
                style={[styles.searchersHeaderButton, sectionHeaderCardStyle, searchersExpanded && styles.searchersHeaderButtonExpanded, styles.minTouchTarget]}
                onPress={() => setSearchersExpanded((prev) => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Joined searchers section, ${Array.isArray(search?.searcherNames) ? search.searcherNames.length : 0} members`}
                accessibilityState={{ expanded: searchersExpanded }}>
                <View style={styles.searchersHeaderContent}>
                  <View style={styles.searchersHeaderTextWrap}>
                    <ThemedText type="subtitle" style={styles.sectionTitle}>Joined Searchers ({Array.isArray(search?.searcherNames) ? search.searcherNames.length : 0})</ThemedText>
                    {!searchersExpanded ? <ThemedText style={[styles.searchersHintText, secondaryTextStyle]}>Tap to expand</ThemedText> : null}
                  </View>
                  <View style={[styles.searchersChevronWrap, sectionChevronWrapStyle]}>
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
                <View style={[styles.searchersSection, sectionBodyCardStyle]}>
                  {Array.isArray(search?.searcherNames) && search.searcherNames.length > 0 ? (
                    search.searcherNames.map((name: string, index: number) => (
                      <ThemedText key={`${name}-${index}`} style={[styles.searcherNameText, { color: palette.text }]}>{index + 1}. {name}</ThemedText>
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

      <Modal
        animationType="fade"
        transparent={true}
        visible={showEndSearchModal}
        onRequestClose={() => !endingSearch && setShowEndSearchModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: palette.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <ThemedText type="title" style={styles.modalTitle}>End Search</ThemedText>
            <ThemedText style={[styles.modalBody, { color: palette.textSecondary }]}>
              Was {search?.pet?.Name ?? 'this pet'} found?
            </ThemedText>

            <TouchableOpacity
              style={[styles.foundButton, { backgroundColor: palette.success }]}
              onPress={() => void runEndSearch(true)}
              disabled={endingSearch}>
              <ThemedText style={styles.modalButtonText}>{endingSearch ? 'Saving...' : 'Found'}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.notFoundButton, { backgroundColor: palette.danger }]}
              onPress={() => void runEndSearch(false)}
              disabled={endingSearch}>
              <ThemedText style={styles.modalButtonText}>{endingSearch ? 'Saving...' : 'Not Found'}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: palette.textMuted }]}
              onPress={() => setShowEndSearchModal(false)}
              disabled={endingSearch}>
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  statusChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusChipActive: {
    backgroundColor: '#e8f6ec',
    borderColor: '#95d5a9',
  },
  statusChipEnded: {
    backgroundColor: '#fbe9e9',
    borderColor: '#e0a7a7',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c3e50',
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
  searchInfoSection: {
    marginTop: 10,
    gap: 4,
  },
  searchInfoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2B3A4A',
  },
  searchInfoText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#2B3A4A',
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
  endSearchButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#7b2d20',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  endSearchButtonText: {
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
  sightingsUnreadBadge: {
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
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#c8d8e8',
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#abc0ce',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8fbfd',
    textAlignVertical: 'top',
    fontSize: 14,
  },
  composerSendButton: {
    backgroundColor: '#1f4f8f',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  composerSendButtonDisabled: {
    opacity: 0.6,
  },
  composerSendButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    marginBottom: 14,
    lineHeight: 20,
  },
  foundButton: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  notFoundButton: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelButton: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});