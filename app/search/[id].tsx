import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapTilerTileMap } from '../../components/maptiler-tile-map';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { auth, db } from '../../src/services/firebaseClient';
import { getSearchById } from '../../src/services/userService';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
const petImageSources: Record<string, any> = {
  'Rigby.jpg': require('../../assets/pets/Rigby.jpg'),
  'Taz.jpg': require('../../assets/pets/Taz.jpg'),
};

export default function SearchDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [search, setSearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [relativeTimeTick, setRelativeTimeTick] = useState(Date.now());

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
      if (!auth.currentUser?.email) {
        setError('Sign in to view this search.');
        return;
      }

      const searchData = await getSearchById(db, id);
      if (!searchData) {
        setError('Search not found.');
        setSearch(null);
        return;
      }

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

  const center = search?.Location ?? search?.location;
  const radiusValue = Number(search?.Radius ?? search?.radius);
  const hasValidRadius = Number.isFinite(radiusValue) && radiusValue > 0;
  const radiusMiles = hasValidRadius ? radiusValue : 0;
  const showMap = Boolean(center?.latitude && center?.longitude && hasValidRadius && MAPTILER_KEY && !loading && !error);

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

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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
                    containerStyle={styles.mapTilesLayer}
                  />

                  <View style={styles.mapMetaCard}>
                    <ThemedText style={styles.metaText}>Center: {center.latitude.toFixed(6)}, {center.longitude.toFixed(6)}</ThemedText>
                    <ThemedText style={styles.metaText}>Radius: {radiusMiles} miles</ThemedText>
                  </View>
                </View>
              ) : (
                <View style={styles.placeholderBox}>
                  <ThemedText style={styles.placeholderTitle}>Map Unavailable</ThemedText>
                  <ThemedText style={styles.placeholderText}>This search is missing a valid location/radius or the MapTiler key is missing.</ThemedText>
                </View>
              )}
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
    backgroundColor: '#0a5df0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
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