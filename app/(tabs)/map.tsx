import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapTilerTileMap } from '@/components/maptiler-tile-map';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { auth, db } from '../../src/services/firebaseClient';
import { getActiveSearches, getUserData, joinSearch } from '../../src/services/userService';

const MAP_ZOOM = 12;
const DEFAULT_RADIUS_MILES = 5;
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
const petImageSources: Record<string, any> = {
  'Rigby.jpg': require('../../assets/pets/Rigby.jpg'),
  'Taz.jpg': require('../../assets/pets/Taz.jpg'),
};

function milesBetweenPoints(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return earthRadiusMiles * y;
}

export default function MapScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [areaSearches, setAreaSearches] = useState<any[]>([]);
  const [relativeTimeTick, setRelativeTimeTick] = useState(Date.now());
  const [joiningSearchId, setJoiningSearchId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const placeholderBoxDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surfaceMuted };
  const mapWidgetDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surfaceMuted };
  const metaCardDynamicStyle = { backgroundColor: colorScheme === 'dark' ? 'rgba(19, 34, 49, 0.92)' : 'rgba(255, 255, 255, 0.92)' };
  const searchCardDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surface };
  const petImagePlaceholderDynamicStyle = { backgroundColor: palette.surfaceMuted };

  useEffect(() => {
    const timer = setInterval(() => {
      setRelativeTimeTick(Date.now());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

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

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const signedInEmail = auth.currentUser?.email;
      if (!signedInEmail) {
        setCenter(null);
        setError('Sign in to load your saved map location.');
        return;
      }

      const account = await getUserData(db, signedInEmail);
      const accountLocation = account?.location;
      setCurrentUserId(account?.id || '');

      if (!accountLocation?.latitude || !accountLocation?.longitude) {
        setCenter(null);
        setError('No saved location found. Update your profile location first.');
        return;
      }

      setCenter({
        latitude: accountLocation.latitude,
        longitude: accountLocation.longitude,
      });

      const parsedRadius = Number(account?.radius ?? DEFAULT_RADIUS_MILES);
      const safeRadius = Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : DEFAULT_RADIUS_MILES;
      setRadiusMiles(safeRadius);

      const activeSearches = await getActiveSearches(db);
      const nearbySearches = activeSearches
        .map((search) => {
          const searchLocation = search?.Location ?? search?.location;
          if (!searchLocation?.latitude || !searchLocation?.longitude) {
            return null;
          }

          const distanceMiles = milesBetweenPoints(
            { latitude: accountLocation.latitude, longitude: accountLocation.longitude },
            { latitude: searchLocation.latitude, longitude: searchLocation.longitude }
          );

          return {
            ...search,
            distanceMiles,
          };
        })
        .filter((search): search is any => {
          if (!search) {
            return false;
          }

          return search.distanceMiles <= safeRadius;
        })
        .sort((a, b) => a.distanceMiles - b.distanceMiles);

      setAreaSearches(nearbySearches);
    } catch (err: any) {
      setCenter(null);
      setAreaSearches([]);
      setCurrentUserId('');
      setError(err?.message || 'Unable to load location data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const showMap = Boolean(center && MAPTILER_KEY && !loading && !error);
  const centerLatitude = center?.latitude ?? 0;
  const centerLongitude = center?.longitude ?? 0;

  const handleJoinSearch = async (searchId: string) => {
    if (!searchId) {
      return;
    }

    try {
      setJoiningSearchId(searchId);
      await joinSearch(db, searchId, auth.currentUser?.email ?? '');
      router.push({ pathname: '/search/[id]', params: { id: searchId } } as any);
    } catch (err: any) {
      Alert.alert('Join failed', err?.message || 'Unable to join this search right now.');
    } finally {
      setJoiningSearchId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <ThemedView style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.surface }]}>
        <ThemedText type="title" style={styles.headerTitle}>Searches in Area</ThemedText>
      </ThemedView>

      <ScrollView style={styles.mapContainer} contentContainerStyle={styles.mapContent}>
        {loading && <ActivityIndicator size="large" color={palette.primary} />}

        {!loading && !MAPTILER_KEY && (
          <View style={[styles.placeholderBox, placeholderBoxDynamicStyle]}>
            <ThemedText style={[styles.placeholderText, { color: palette.text }]}>MapTiler API Key Missing</ThemedText>
            <ThemedText style={[styles.infoText, { color: palette.textSecondary }]}>Set EXPO_PUBLIC_MAPTILER_API_KEY to display the map widget.</ThemedText>
          </View>
        )}

        {!loading && Boolean(error) && (
          <View style={[styles.placeholderBox, placeholderBoxDynamicStyle]}>
            <ThemedText style={[styles.placeholderText, { color: palette.text }]}>Map Unavailable</ThemedText>
            <ThemedText style={[styles.infoText, { color: palette.textSecondary }]}>{error}</ThemedText>
          </View>
        )}

        {showMap && (
          <View style={[styles.mapWidget, mapWidgetDynamicStyle]}>
            <MapTilerTileMap
              center={center!}
              radiusMiles={radiusMiles}
              apiKey={MAPTILER_KEY!}
              zoom={MAP_ZOOM}
              styleId="streets-v4"
              markers={areaSearches.map((search, index) => {
                const location = search?.Location ?? search?.location;
                return {
                  latitude: location?.latitude,
                  longitude: location?.longitude,
                  label: String(index + 1),
                };
              })}
              containerStyle={styles.mapTilesLayer}
            />

            <View style={[styles.mapMetaCard, metaCardDynamicStyle]}>
              <ThemedText style={[styles.metaText, { color: palette.text }]}>Center: {centerLatitude.toFixed(6)}, {centerLongitude.toFixed(6)}</ThemedText>
              <ThemedText style={[styles.metaText, { color: palette.text }]}>Radius: {radiusMiles} miles</ThemedText>
            </View>
          </View>
        )}

        {!loading && showMap && (
          <>
            <ThemedText style={[styles.creditText, { color: palette.textSecondary }]}>Map tiles by MapTiler, data by OpenStreetMap contributors.</ThemedText>
            <ThemedText style={[styles.resultsHeader, { color: palette.text }]}>Searches in your {radiusMiles} mile radius: {areaSearches.length}</ThemedText>

            {areaSearches.length === 0 ? (
              <ThemedText style={[styles.emptyText, { color: palette.textSecondary }]}>No active searches are currently within your configured radius.</ThemedText>
            ) : (
              areaSearches.map((search: any, index: number) => (
                <View key={search.id} style={[styles.searchCard, searchCardDynamicStyle]}>
                  {(() => {
                    const searcherIds = Array.isArray(search?.searchers)
                      ? search.searchers
                      : Array.isArray(search?.Searchers)
                      ? search.Searchers
                      : [];
                    const isJoined = Boolean(currentUserId && searcherIds.includes(currentUserId));

                    return (
                      <>
                  <View style={styles.searchNumberBadge}>
                    <ThemedText style={styles.searchNumberBadgeText}>{index + 1}</ThemedText>
                  </View>

                  <View style={styles.petCardHeader}>
                    <ThemedText style={[styles.petName, { color: palette.text }]}>{search?.pet?.Name || 'Unnamed pet'}</ThemedText>
                    <ThemedText style={[styles.searchAge, { color: palette.primary }]}>{formatTimeSinceSearch(search?.Date ?? search?.date)}</ThemedText>
                    <ThemedText style={[styles.searchStatus, { color: palette.textSecondary }]}>Search status: {search.status ?? search.Status ?? 'Unknown'}</ThemedText>
                  </View>

                  <View style={styles.petCardRow}>
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
                      <View style={[styles.petImagePlaceholder, petImagePlaceholderDynamicStyle]}>
                        <ThemedText style={[styles.petImageText, { color: palette.textSecondary }]}>No image</ThemedText>
                      </View>
                    )}

                    <View style={styles.petDetails}>
                      <ThemedText>Breed: {search?.pet?.Breed ?? 'Unknown'}</ThemedText>
                      <ThemedText>Color: {Array.isArray(search?.pet?.Color) ? search.pet.Color.join(', ') : search?.pet?.Color ?? 'Unknown'}</ThemedText>
                      <ThemedText>Size: {search?.pet?.Size ?? 'Unknown'}</ThemedText>
                      <ThemedText>Distance: {Number(search?.distanceMiles ?? 0).toFixed(1)} miles away</ThemedText>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.joinSearchButton, styles.minTouchTarget, { backgroundColor: palette.primary }]}
                    onPress={() => {
                      if (isJoined) {
                        router.push({ pathname: '/search/[id]', params: { id: search.id } } as any);
                        return;
                      }

                      void handleJoinSearch(search.id);
                    }}
                    disabled={!isJoined && joiningSearchId === search.id}
                    accessibilityRole="button"
                    accessibilityLabel={isJoined ? 'Open search details' : 'Join search'}
                    accessibilityHint={isJoined ? 'Opens this search details screen' : 'Joins this search and opens details'}>
                    <ThemedText style={styles.joinSearchButtonText}>
                      {isJoined ? 'Search Details' : joiningSearchId === search.id ? 'Joining...' : 'Join Search'}
                    </ThemedText>
                  </TouchableOpacity>
                      </>
                    );
                  })()}
                </View>
              ))
            )}
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  mapContainer: {
    flex: 1,
  },
  mapContent: {
    padding: 16,
  },
  placeholderBox: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d3d9df',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  mapWidget: {
    width: '100%',
    height: 320,
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
    right: 10,
    bottom: 10,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  metaText: {
    fontSize: 12,
    color: '#1d3348',
  },
  creditText: {
    marginTop: 8,
    fontSize: 11,
    color: '#5a6f82',
    textAlign: 'center',
  },
  resultsHeader: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#1d3348',
  },
  emptyText: {
    fontSize: 14,
    color: '#4f6273',
    marginBottom: 10,
  },
  searchCard: {
    padding: 14,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7a8a8f',
    backgroundColor: '#BFCECF',
    position: 'relative',
  },
  searchNumberBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0a5df0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffffff',
    zIndex: 2,
  },
  searchNumberBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  petCardHeader: {
    marginBottom: 8,
  },
  petName: {
    fontWeight: 'bold',
    fontSize: 22,
    color: '#2B3A4A',
    marginBottom: 4,
  },
  searchAge: {
    fontSize: 12,
    color: '#0a5df0',
    fontWeight: '700',
    marginBottom: 4,
  },
  searchStatus: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#37536B',
  },
  petCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  petImage: {
    width: 110,
    height: 110,
    borderRadius: 10,
  },
  petDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  petImagePlaceholder: {
    width: 110,
    height: 110,
    backgroundColor: '#D9DDE0',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  petImageText: {
    color: '#4E5B63',
    fontSize: 14,
  },
  joinSearchButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 12,
  },
  minTouchTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  joinSearchButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
