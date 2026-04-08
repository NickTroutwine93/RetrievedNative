import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapTilerTileMap } from '@/components/maptiler-tile-map';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { auth, db } from '../../src/services/firebaseClient';
import { getUserData, joinSearch, subscribeToActiveSearches } from '../../src/services/userService';

const MAP_ZOOM = 12;
const PRIVACY_SAFE_MARKER_ZOOM = 13;
const DEFAULT_RADIUS_MILES = 5;
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
const FILTER_ANY = 'Any';
const SIZE_FILTER_OPTIONS = ['XS', 'S', 'M', 'L', 'XL'];
const COLOR_FILTER_OPTIONS = [
  'Black',
  'Brown',
  'Tan',
  'Gray',
  'White',
  'Multicolor',
];
const DEFAULT_PET_IMAGE = require('../../assets/pets/Default.jpg');
const BREED_FILTER_OPTIONS = [
  'Australian Shepherd',
  'Beagle',
  'Border Collie',
  'Boxer',
  'Bulldog',
  'Burmese',
  'Cat',
  'Chihuahua',
  'Corgi',
  'Dachshund',
  'Dalmatian',
  'French Bulldog',
  'German Shepherd',
  'Golden Retriever',
  'Great Dane',
  'Hound',
  'Labrador Retriever',
  'Pit Bull / Staffordshire Terrier',
  'Pomeranian',
  'Poodle',
  'Rottweiler',
  'Schnauzer',
  'Shih Tzu',
  'Siberian Husky',
  'Yorkshire Terrier',
  'Mixed Breed',
  'Unknown',
];
const petImageSources: Record<string, any> = {
  'Rigby.jpg': require('../../assets/pets/Rigby.jpg'),
  'Taz.jpg': require('../../assets/pets/Taz.jpg'),
  'Default.jpg': DEFAULT_PET_IMAGE,
};

function getPetColorSwatchStyle(colorName: string) {
  const key = String(colorName || '').toLowerCase();
  const swatchMap: Record<string, { backgroundColor: string; borderColor: string }> = {
    black: { backgroundColor: '#1f1f1f', borderColor: '#1f1f1f' },
    brown: { backgroundColor: '#8b5a2b', borderColor: '#8b5a2b' },
    tan: { backgroundColor: '#d2b48c', borderColor: '#d2b48c' },
    gray: { backgroundColor: '#8a8f98', borderColor: '#8a8f98' },
    white: { backgroundColor: '#ffffff', borderColor: '#9ca3af' },
    multicolor: { backgroundColor: '#a78bfa', borderColor: '#7c3aed' },
  };

  return swatchMap[key] || { backgroundColor: '#9ca3af', borderColor: '#9ca3af' };
}

function getMulticolorSwatchParts(selectedColors: string[]) {
  const normalizedSelected = selectedColors.map((color) => String(color).toLowerCase());
  const explicitColors = normalizedSelected.filter((color) => color !== 'multicolor');
  const palette = explicitColors.length > 0 ? explicitColors : ['white', 'brown'];

  return palette.map((color) => getPetColorSwatchStyle(color).backgroundColor);
}

function normalizeValue(value: any) {
  return String(value ?? '').trim().toLowerCase();
}

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
  const [disclaimerVisible, setDisclaimerVisible] = useState(false);
  const [pendingJoinSearchId, setPendingJoinSearchId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [mapZoom, setMapZoom] = useState(MAP_ZOOM);
  const [selectedBreeds, setSelectedBreeds] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [activeFilterMenu, setActiveFilterMenu] = useState<'breed' | 'size' | 'color' | null>(null);
  const placeholderBoxDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surfaceMuted };
  const mapWidgetDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surfaceMuted };
  const metaCardDynamicStyle = { backgroundColor: colorScheme === 'dark' ? 'rgba(19, 34, 49, 0.92)' : 'rgba(255, 255, 255, 0.92)' };
  const searchCardDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surface };
  const petImagePlaceholderDynamicStyle = { backgroundColor: palette.surfaceMuted };


  const filteredSearches = useMemo(() => {
    const normalizedBreeds = selectedBreeds.map(normalizeValue);
    const normalizedSizes = selectedSizes.map((size) => normalizeValue(size));
    const normalizedColors = selectedColors.map((color) => normalizeValue(color));

    return areaSearches.filter((search) => {
      const pet = search?.pet ?? {};
      const petBreed = normalizeValue(pet?.Breed);
      const petSize = normalizeValue(pet?.Size);
      const petColors = Array.isArray(pet?.Color)
        ? pet.Color.map((color: string) => normalizeValue(color))
        : String(pet?.Color ?? '')
            .split(',')
            .map((color) => normalizeValue(color))
            .filter((color) => color.length > 0);

      const breedMatch = normalizedBreeds.length === 0 || normalizedBreeds.includes(petBreed);
      const sizeMatch = normalizedSizes.length === 0 || normalizedSizes.includes(petSize);
      const colorMatch = normalizedColors.length === 0 || petColors.some((color: string) => normalizedColors.includes(color));

      return breedMatch && sizeMatch && colorMatch;
    });
  }, [areaSearches, selectedBreeds, selectedSizes, selectedColors]);

  const hasActiveFilters =
    selectedBreeds.length > 0 || selectedSizes.length > 0 || selectedColors.length > 0;

  const toggleFilterSelection = (
    value: string,
    setSelectedValues: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setSelectedValues((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  useEffect(() => {
    setActiveFilterMenu(null);
  }, [center, radiusMiles]);

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

  useEffect(() => {
    if (!center || !currentUserId) {
      return;
    }

    const unsubscribe = subscribeToActiveSearches(
      db,
      currentUserId,
      (allSearches: any[]) => {
        const nearbySearches = allSearches
          .map((search) => {
            const searchLocation = search?.Location ?? search?.location;
            if (!searchLocation?.latitude || !searchLocation?.longitude) {
              return null;
            }

            const distanceMiles = milesBetweenPoints(
              { latitude: center.latitude, longitude: center.longitude },
              { latitude: searchLocation.latitude, longitude: searchLocation.longitude }
            );

            return { ...search, distanceMiles };
          })
          .filter((search): search is any => search !== null && search.distanceMiles <= radiusMiles)
          .sort((a, b) => a.distanceMiles - b.distanceMiles);

        setAreaSearches(nearbySearches);
      },
    );

    return unsubscribe;
  }, [center, radiusMiles, currentUserId]);

  const showMap = Boolean(center && MAPTILER_KEY && !loading && !error);
  const centerLatitude = center?.latitude ?? 0;
  const centerLongitude = center?.longitude ?? 0;
  const obfuscatedSearchPoints = useMemo(
    () =>
      filteredSearches
        .filter((search) => {
          const location = search?.Location ?? search?.location;
          return Boolean(location?.latitude && location?.longitude);
        })
        .map((search, index) => {
          const location = search?.Location ?? search?.location;
          const obscured = search?.locationIsObfuscated
            ? location
            : getObfuscatedCoordinate(location, String(search?.id || search?.OwnerID || index));

          return {
            id: search.id || `search-${index}`,
            latitude: obscured.latitude,
            longitude: obscured.longitude,
            label: String(index + 1),
          };
        }),
    [filteredSearches]
  );
  const usePrivacyZones = mapZoom > PRIVACY_SAFE_MARKER_ZOOM;

  const promptJoinSearch = (searchId: string) => {
    setPendingJoinSearchId(searchId);
    setDisclaimerVisible(true);
  };

  const handleDisclaimerAgree = () => {
    setDisclaimerVisible(false);
    if (pendingJoinSearchId) {
      void handleJoinSearch(pendingJoinSearchId);
      setPendingJoinSearchId(null);
    }
  };

  const handleDisclaimerCancel = () => {
    setDisclaimerVisible(false);
    setPendingJoinSearchId(null);
  };

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
      <Modal
        transparent
        visible={disclaimerVisible}
        animationType="fade"
        onRequestClose={handleDisclaimerCancel}>
        <Pressable style={styles.disclaimerBackdrop} onPress={handleDisclaimerCancel}>
          <Pressable style={[styles.disclaimerPanel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <ThemedText style={[styles.disclaimerTitle, { color: palette.text }]}>Safety Reminder</ThemedText>
            <ThemedText style={[styles.disclaimerBody, { color: palette.textSecondary }]}>
              By joining this search you agree to assist responsibly. If you encounter the lost animal, do{' '}
              <ThemedText style={{ fontWeight: '700', color: palette.text }}>not</ThemedText> attempt to approach,
              chase, or corner it. Lost animals are frightened and may behave unpredictably. Instead, report the
              sighting through the app so the owner and trained responders can be notified.
            </ThemedText>
            <View style={styles.disclaimerActions}>
              <TouchableOpacity
                style={[styles.disclaimerCancelBtn, { borderColor: palette.border }]}
                onPress={handleDisclaimerCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel joining search">
                <ThemedText style={[styles.disclaimerCancelText, { color: palette.textSecondary }]}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.disclaimerAgreeBtn, { backgroundColor: palette.primary }]}
                onPress={handleDisclaimerAgree}
                accessibilityRole="button"
                accessibilityLabel="Agree and join search">
                <ThemedText style={styles.disclaimerAgreeText}>I Agree</ThemedText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
              maxZoom={16}
              styleId="streets-v4"
              onZoomChange={setMapZoom}
              markers={usePrivacyZones ? [] : obfuscatedSearchPoints}
              zones={
                usePrivacyZones
                  ? obfuscatedSearchPoints.map((searchPoint) => ({
                      id: `privacy-zone-${searchPoint.id}`,
                      latitude: searchPoint.latitude,
                      longitude: searchPoint.longitude,
                      radiusMiles: 0.5,
                      fillColor: 'rgba(0, 70, 140, 0.26)',
                      borderColor: 'rgba(0, 70, 140, 0.70)',
                    }))
                  : []
              }
              containerStyle={styles.mapTilesLayer}
            />

            <View style={[styles.mapMetaCard, metaCardDynamicStyle]}>
              <ThemedText style={[styles.metaText, { color: palette.text }]}>Center: {centerLatitude.toFixed(6)}, {centerLongitude.toFixed(6)}</ThemedText>
              <ThemedText style={[styles.metaText, { color: palette.text }]}>Radius: {radiusMiles} miles</ThemedText>
              <ThemedText style={[styles.metaText, { color: palette.text }]}>
                {usePrivacyZones ? 'Privacy mode: obscured 0.5 mile zones' : 'View mode: numbered search markers'}
              </ThemedText>
            </View>
          </View>
        )}

        {!loading && showMap && (
          <>
            <ThemedText style={[styles.creditText, { color: palette.textSecondary }]}>Map tiles by MapTiler, data by OpenStreetMap contributors.</ThemedText>
            <View style={styles.filtersContainer}>
              <View style={styles.filtersRow}>
                <View style={[styles.filterItem, activeFilterMenu === 'breed' ? styles.filterItemActive : null]}>
                  <ThemedText style={[styles.filterLabel, { color: palette.textSecondary }]}>Breed</ThemedText>
                  <TouchableOpacity style={[styles.filterButton, { borderColor: palette.border }]} onPress={() => setActiveFilterMenu((prev) => (prev === 'breed' ? null : 'breed'))}>
                    <ThemedText style={[styles.filterButtonText, { color: palette.text }]} numberOfLines={1}>
                      {selectedBreeds.length > 0 ? `${selectedBreeds.length} selected` : FILTER_ANY}
                    </ThemedText>
                  </TouchableOpacity>
                  {activeFilterMenu === 'breed' && (
                    <ScrollView style={[styles.filterMenuOverlay, { borderColor: palette.border, backgroundColor: palette.surface }]} nestedScrollEnabled>
                      {BREED_FILTER_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={`breed-${option}`}
                          style={[styles.filterOption, selectedBreeds.includes(option) ? styles.filterOptionSelected : null]}
                          onPress={() => {
                            toggleFilterSelection(option, setSelectedBreeds);
                          }}>
                          <ThemedText style={[styles.filterOptionText, { color: palette.text }]}>
                            {selectedBreeds.includes(option) ? `✓ ${option}` : option}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>

                <View style={[styles.filterItem, activeFilterMenu === 'size' ? styles.filterItemActive : null]}>
                  <ThemedText style={[styles.filterLabel, { color: palette.textSecondary }]}>Size</ThemedText>
                  <TouchableOpacity style={[styles.filterButton, { borderColor: palette.border }]} onPress={() => setActiveFilterMenu((prev) => (prev === 'size' ? null : 'size'))}>
                    <ThemedText style={[styles.filterButtonText, { color: palette.text }]} numberOfLines={1}>
                      {selectedSizes.length > 0 ? `${selectedSizes.length} selected` : FILTER_ANY}
                    </ThemedText>
                  </TouchableOpacity>
                  {activeFilterMenu === 'size' && (
                    <View style={[styles.filterMenuOverlay, { borderColor: palette.border, backgroundColor: palette.surface }]}>
                      {SIZE_FILTER_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={`size-${option}`}
                          style={[styles.filterOption, selectedSizes.includes(option) ? styles.filterOptionSelected : null]}
                          onPress={() => {
                            toggleFilterSelection(option, setSelectedSizes);
                          }}>
                          <ThemedText style={[styles.filterOptionText, { color: palette.text }]}>
                            {selectedSizes.includes(option) ? `✓ ${option}` : option}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                <View style={[styles.filterItem, activeFilterMenu === 'color' ? styles.filterItemActive : null]}>
                  <ThemedText style={[styles.filterLabel, { color: palette.textSecondary }]}>Color</ThemedText>
                  <TouchableOpacity style={[styles.filterButton, { borderColor: palette.border }]} onPress={() => setActiveFilterMenu((prev) => (prev === 'color' ? null : 'color'))}>
                    <ThemedText style={[styles.filterButtonText, { color: palette.text }]} numberOfLines={1}>
                      {selectedColors.length > 0 ? `${selectedColors.length} selected` : FILTER_ANY}
                    </ThemedText>
                  </TouchableOpacity>
                  {activeFilterMenu === 'color' && (
                    <ScrollView style={[styles.filterMenuOverlay, { borderColor: palette.border, backgroundColor: palette.surface }]} nestedScrollEnabled>
                      {COLOR_FILTER_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={`color-${option}`}
                          style={[styles.filterOption, selectedColors.includes(option) ? styles.filterOptionSelected : null]}
                          onPress={() => {
                            toggleFilterSelection(option, setSelectedColors);
                          }}>
                          <View style={styles.filterOptionRow}>
                            {option === 'Multicolor' ? (
                              <View style={[styles.colorSwatch, styles.colorSwatchMulticolor]}>
                                {getMulticolorSwatchParts(selectedColors).map((partColor, index) => (
                                  <View
                                    key={`${option}-part-${index}`}
                                    style={[styles.colorSwatchPart, { backgroundColor: partColor }]}
                                  />
                                ))}
                              </View>
                            ) : (
                              <View style={[styles.colorSwatch, getPetColorSwatchStyle(option)]} />
                            )}
                            <ThemedText style={[styles.filterOptionText, { color: palette.text }]}>
                              {selectedColors.includes(option) ? `✓ ${option}` : option}
                            </ThemedText>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>

              {hasActiveFilters && (
                <TouchableOpacity
                  style={[styles.clearFiltersButton, { borderColor: palette.border }]}
                  onPress={() => {
                    setSelectedBreeds([]);
                    setSelectedSizes([]);
                    setSelectedColors([]);
                    setActiveFilterMenu(null);
                  }}>
                  <ThemedText style={[styles.clearFiltersButtonText, { color: palette.text }]}>Clear Filters</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            <ThemedText style={[styles.resultsHeader, { color: palette.text }]}>Searches in your {radiusMiles} mile radius: {filteredSearches.length}</ThemedText>

            {filteredSearches.length === 0 ? (
              <ThemedText style={[styles.emptyText, { color: palette.textSecondary }]}>
                {hasActiveFilters
                  ? 'No active searches match the selected filters.'
                  : 'No active searches are currently within your configured radius.'}
              </ThemedText>
            ) : (
              filteredSearches.map((search: any, index: number) => (
                <View key={search.id} style={[styles.searchCard, searchCardDynamicStyle]}>
                  {(() => {
                    const searcherIds = Array.isArray(search?.searchers)
                      ? search.searchers
                      : Array.isArray(search?.Searchers)
                      ? search.Searchers
                      : [];
                    const ownerId = search?.owner ?? search?.OwnerID;
                    const isOwner = Boolean(currentUserId && ownerId && currentUserId === ownerId);
                    const isJoined = Boolean(currentUserId && (isOwner || searcherIds.includes(currentUserId)));

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
                    <Image
                      source={
                        search?.pet?.Image && search.pet.Image.startsWith('http')
                          ? { uri: search.pet.Image }
                          : petImageSources[search?.pet?.Image] || DEFAULT_PET_IMAGE
                      }
                      style={styles.petImage}
                      resizeMode="cover"
                    />

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

                      promptJoinSearch(search.id);
                    }}
                    disabled={!isJoined && joiningSearchId === search.id}
                    accessibilityRole="button"
                    accessibilityLabel={isJoined ? 'Open search' : 'Join search'}
                    accessibilityHint={isJoined ? 'Opens this search details screen' : 'Joins this search and opens details'}>
                    <ThemedText style={styles.joinSearchButtonText}>
                      {isJoined ? 'Open Search' : joiningSearchId === search.id ? 'Joining...' : 'Join Search'}
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
  filtersContainer: {
    marginTop: 12,
    marginBottom: 4,
    position: 'relative',
    overflow: 'visible',
    zIndex: 40,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    zIndex: 20,
    overflow: 'visible',
  },
  filterItem: {
    flex: 1,
    position: 'relative',
    overflow: 'visible',
  },
  filterItemActive: {
    zIndex: 60,
    elevation: 12,
  },
  filterLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  filterButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 38,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterMenuOverlay: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 170,
    overflow: 'hidden',
    zIndex: 30,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  filterOption: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e9ef',
  },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 8,
  },
  colorSwatchMulticolor: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderColor: '#7c3aed',
  },
  colorSwatchPart: {
    flex: 1,
  },
  filterOptionSelected: {
    backgroundColor: '#e8f3ff',
  },
  filterOptionText: {
    fontSize: 13,
  },
  clearFiltersButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  clearFiltersButtonText: {
    fontSize: 12,
    fontWeight: '700',
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
  disclaimerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disclaimerPanel: {
    width: '88%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 10,
  },
  disclaimerTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  disclaimerBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
  },
  disclaimerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  disclaimerCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  disclaimerCancelText: {
    fontWeight: '600',
    fontSize: 14,
  },
  disclaimerAgreeBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  disclaimerAgreeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
