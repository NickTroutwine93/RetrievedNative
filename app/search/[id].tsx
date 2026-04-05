import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapTilerTileMap } from '@/components/maptiler-tile-map';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { auth, db } from '../../src/services/firebaseClient';
import { getSearchById, getUserData, leaveSearch } from '../../src/services/userService';

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

export default function SearchDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [search, setSearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [relativeTimeTick, setRelativeTimeTick] = useState(Date.now());
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedSighting, setSelectedSighting] = useState<any>(null);
  const [leavingSearch, setLeavingSearch] = useState(false);

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

      const [searchData, account] = await Promise.all([
        getSearchById(db, id),
        getUserData(db, signedInEmail),
      ]);
      if (!searchData) {
        setError('Search not found.');
        setSearch(null);
        return;
      }

      setCurrentUserId(account?.id || '');
      setSearch(searchData);
      setSelectedSighting((prev: any) => {
        if (!prev?.id) {
          return searchData?.sightings?.[0] || null;
        }

        return searchData?.sightings?.find((sighting: any) => sighting.id === prev.id) || searchData?.sightings?.[0] || null;
      });
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
  const canAddSighting = Boolean(currentUserId && ownerId && currentUserId !== ownerId && searcherIds.includes(currentUserId));
  const canLeaveSearch = canAddSighting;
  const sightingsWithIndex = Array.isArray(search?.sightings)
    ? search.sightings.map((sighting: any, index: number) => ({
        ...sighting,
        markerIndex: index + 1,
      }))
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

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol size={18} name="chevron.right" color="#ffffff" style={styles.backIcon} />
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title" style={styles.headerTitle}>Search Details</ThemedText>
      </ThemedView>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator size="large" color="#0076C0" />
        ) : error ? (
          <View style={styles.placeholderBox}>
            <ThemedText style={styles.placeholderTitle}>Search Unavailable</ThemedText>
            <ThemedText style={styles.placeholderText}>{error}</ThemedText>
          </View>
        ) : search ? (
          <>
            <View style={styles.petCard}>
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
              <ThemedText type="subtitle" style={styles.sectionTitle}>Search Area</ThemedText>
              {canAddSighting ? (
                <TouchableOpacity style={styles.addSightingButton} onPress={() => router.push({ pathname: '/search/[id]/sighting', params: { id } } as any)}>
                  <ThemedText style={styles.addSightingButtonText}>Add Sighting</ThemedText>
                </TouchableOpacity>
              ) : null}
              {canLeaveSearch ? (
                <TouchableOpacity style={styles.leaveSearchButton} onPress={handleLeaveSearch} disabled={leavingSearch}>
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
                    centerMarkerColor="#0a5df0"
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

              {selectedSighting ? (
                <View style={styles.sightingCard}>
                  <ThemedText style={styles.sightingTitle}>Latest Selected Sighting</ThemedText>
                  <ThemedText style={styles.sightingMeta}>Reported by {selectedSighting.reporterName} • {formatRelativeTime(selectedSighting.createdAt)}</ThemedText>
                  <ThemedText style={styles.sightingMeta}>Confidence: {selectedSighting.confidence}/5</ThemedText>
                  <ThemedText style={styles.sightingMeta}>Marker: #{sightingsWithIndex.findIndex((s: any) => s.id === selectedSighting.id) + 1}</ThemedText>
                  <ThemedText style={styles.sightingMeta}>Coordinates: {selectedSighting.latitude.toFixed(6)}, {selectedSighting.longitude.toFixed(6)}</ThemedText>
                  <ThemedText style={styles.sightingDetails}>{selectedSighting.details || 'No additional details were provided.'}</ThemedText>
                </View>
              ) : sightingsWithIndex.length === 0 ? (
                <View style={styles.sightingCard}>
                  <ThemedText style={styles.sightingTitle}>No Sightings Yet</ThemedText>
                  <ThemedText style={styles.sightingDetails}>When joined searchers report sightings, they will appear on the map as numbered markers here.</ThemedText>
                </View>
              ) : null}

              {sightingsWithIndex.length > 0 ? (
                <View style={styles.sightingTilesSection}>
                  {sightingsWithIndex.map((sighting: any) => {
                    const isSelected = selectedSighting?.id === sighting.id;
                    return (
                      <TouchableOpacity
                        key={sighting.id}
                        style={[styles.sightingTile, isSelected && styles.sightingTileSelected]}
                        onPress={() => setSelectedSighting(sighting)}>
                        <View style={[styles.sightingTileBadge, { backgroundColor: getConfidenceColor(sighting.confidence) }]}>
                          <ThemedText style={[styles.sightingTileBadgeText, { color: getConfidenceTextColor(sighting.confidence) }]}>{sighting.markerIndex}</ThemedText>
                        </View>
                        <ThemedText style={styles.sightingTileTitle}>Sighting #{sighting.markerIndex}</ThemedText>
                        <ThemedText style={styles.sightingTileMeta}>Reported by {sighting.reporterName} • {formatRelativeTime(sighting.createdAt)}</ThemedText>
                        <ThemedText style={styles.sightingTileMeta}>Confidence: {sighting.confidence}/5</ThemedText>
                        <ThemedText style={styles.sightingTileMeta}>Coords: {sighting.latitude.toFixed(5)}, {sighting.longitude.toFixed(5)}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.searchersSection}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Joined Searchers</ThemedText>
              {Array.isArray(search?.searcherNames) && search.searcherNames.length > 0 ? (
                search.searcherNames.map((name: string, index: number) => (
                  <ThemedText key={`${name}-${index}`} style={styles.searcherNameText}>{index + 1}. {name}</ThemedText>
                ))
              ) : (
                <ThemedText style={styles.placeholderText}>No one has joined this search yet.</ThemedText>
              )}
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
  searchersSection: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c6d4e0',
    backgroundColor: '#f5f9fd',
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
    gap: 6,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1c38a',
    backgroundColor: '#fff7ea',
  },
  sightingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#5b3c00',
  },
  sightingMeta: {
    fontSize: 13,
    color: '#6d5331',
  },
  sightingDetails: {
    fontSize: 14,
    lineHeight: 20,
    color: '#3b3226',
  },
  sightingTilesSection: {
    gap: 10,
  },
  sightingTile: {
    position: 'relative',
    gap: 5,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7e3ee',
    backgroundColor: '#f7fbff',
  },
  sightingTileSelected: {
    borderColor: '#d23f31',
    backgroundColor: '#fff4f2',
  },
  sightingTileBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
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
    fontSize: 12,
  },
  sightingTileTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#21384e',
    paddingRight: 32,
  },
  sightingTileMeta: {
    fontSize: 13,
    color: '#4e667c',
    lineHeight: 18,
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
});