import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MapTilerInteractiveMap } from '../../../components/maptiler-interactive-map';
import { ThemedText } from '../../../components/themed-text';
import { ThemedView } from '../../../components/themed-view';
import { Colors } from '../../../constants/theme';
import { useColorScheme } from '../../../hooks/use-color-scheme';
import { auth, db } from '../../../src/services/firebaseClient';
import { getSearchById, getUserData, submitSearchSighting } from '../../../src/services/userService';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;

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

export default function AddSightingScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const { id } = useLocalSearchParams<{ id?: string }>();
  const backButtonDynamicStyle = { backgroundColor: palette.primary };
  const sectionCardDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surface };
  const sectionTitleDynamicStyle = { color: palette.text };
  const sectionHelpDynamicStyle = { color: palette.textSecondary };
  const detailsInputDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surfaceMuted, color: palette.text };
  const placeholderBoxDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surfaceMuted };
  const mapWrapperDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surfaceMuted };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [details, setDetails] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isMapInteracting, setIsMapInteracting] = useState(false);

  const loadContext = useCallback(async () => {
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
        setError('Sign in to report a sighting.');
        return;
      }

      const [nextSearch, nextAccount] = await Promise.all([
        getSearchById(db, id),
        getUserData(db, signedInEmail),
      ]);

      if (!nextSearch) {
        setError('Search not found.');
        setSearch(null);
        return;
      }

      if (!nextAccount?.id) {
        setError('Your account could not be loaded.');
        return;
      }

      const ownerId = nextSearch.owner ?? nextSearch.OwnerID;
      const searcherIds = Array.isArray(nextSearch.searchers)
        ? nextSearch.searchers
        : Array.isArray(nextSearch.Searchers)
        ? nextSearch.Searchers
        : [];

      const canSubmitSighting = nextAccount.id === ownerId || searcherIds.includes(nextAccount.id);
      if (!canSubmitSighting) {
        setError('Only the pet owner or joined searchers can submit sightings for this search.');
        return;
      }

      setSearch(nextSearch);
      setAccount(nextAccount);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load the sighting form.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const searchCenter = useMemo(() => {
    const center = search?.Location ?? search?.location;
    if (!center?.latitude || !center?.longitude) {
      return null;
    }

    return {
      latitude: center.latitude,
      longitude: center.longitude,
    };
  }, [search]);

  const handleUseCurrentLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Location permission is required to use your current location.');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({});
      setSelectedLocation({
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      });
    } catch (locationError: any) {
      Alert.alert('Location unavailable', locationError?.message || 'Could not get your current location.');
    }
  };

  const handleSubmit = async () => {
    if (!id || !account?.id) {
      Alert.alert('Unavailable', 'The sighting form is missing required context.');
      return;
    }

    if (!confidence) {
      Alert.alert('Confidence required', 'Select how sure you are on the 1-5 scale.');
      return;
    }

    if (!selectedLocation) {
      Alert.alert('Location required', 'Use your current location or tap the map to drop the sighting marker.');
      return;
    }

    try {
      setSaving(true);
      const reporterName = [account.FirstName ?? account.firstName, account.LastName ?? account.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || account.Email || auth.currentUser?.email || 'Searcher';

      await submitSearchSighting(db, {
        searchId: id,
        reporterId: account.id,
        reporterName,
        confidence,
        details,
        location: selectedLocation,
      });

      router.replace({ pathname: '/search/[id]', params: { id } } as any);
    } catch (submitError: any) {
      Alert.alert('Could not submit sighting', submitError?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <ThemedView style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.surface }]}>
        <TouchableOpacity
          style={[styles.backButton, backButtonDynamicStyle, styles.minTouchTarget]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to search details">
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title" style={styles.headerTitle}>Report Sighting</ThemedText>
      </ThemedView>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent} scrollEnabled={!isMapInteracting}>
        {loading ? (
          <ActivityIndicator size="large" color={palette.primary} />
        ) : error ? (
          <View style={[styles.placeholderBox, placeholderBoxDynamicStyle]}>
            <ThemedText style={[styles.placeholderTitle, { color: palette.text }]}>Sighting Unavailable</ThemedText>
            <ThemedText style={[styles.placeholderText, { color: palette.textSecondary }]}>{error}</ThemedText>
          </View>
        ) : (
          <>
            <View style={[styles.sectionCard, sectionCardDynamicStyle]}>
              <ThemedText style={[styles.sectionTitle, sectionTitleDynamicStyle]}>How sure are you?</ThemedText>
              <ThemedText style={[styles.sectionHelp, sectionHelpDynamicStyle]}>Rate your confidence from 1 (lowest) to 5 (highest).</ThemedText>
              <View style={styles.confidenceRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.confidenceChip,
                      { borderColor: getConfidenceColor(value) },
                      confidence === value && { backgroundColor: getConfidenceColor(value) },
                    ]}
                    onPress={() => setConfidence(value)}
                    accessibilityRole="button"
                    accessibilityLabel={`Confidence ${value} of 5`}
                    accessibilityState={{ selected: confidence === value }}>
                    <ThemedText
                      style={[
                        styles.confidenceChipText,
                        { color: getConfidenceColor(value) },
                        confidence === value && { color: getConfidenceTextColor(value) },
                      ]}>
                      {value}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.sectionCard, sectionCardDynamicStyle]}>
              <ThemedText style={[styles.sectionTitle, sectionTitleDynamicStyle]}>Sighting Details</ThemedText>
              <TextInput
                style={[styles.detailsInput, detailsInputDynamicStyle]}
                multiline
                numberOfLines={5}
                value={details}
                onChangeText={setDetails}
                placeholder="What did you see? Which direction was the dog moving? Any landmarks or behavior details?"
                placeholderTextColor={palette.textMuted}
                accessibilityLabel="Sighting details"
                textAlignVertical="top"
              />
            </View>

            <View style={[styles.sectionCard, sectionCardDynamicStyle]}>
              <ThemedText style={[styles.sectionTitle, sectionTitleDynamicStyle]}>Sighting Location</ThemedText>
              <ThemedText style={[styles.sectionHelp, sectionHelpDynamicStyle]}>Tap the map to drop a sighting marker, or use your current location.</ThemedText>

              {/*
              <TouchableOpacity
                style={[styles.useLocationButton, styles.minTouchTarget, { backgroundColor: palette.primary }]}
                onPress={handleUseCurrentLocation}
                accessibilityRole="button"
                accessibilityLabel="Use current location"
                accessibilityHint="Uses your GPS location as the sighting location">
                <ThemedText style={styles.useLocationButtonText}>Use Current Location</ThemedText>
              </TouchableOpacity>
              */}

              {selectedLocation ? (
                <ThemedText style={[styles.locationText, { color: palette.textSecondary }]}>
                  Selected: {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                </ThemedText>
              ) : null}

              {searchCenter && MAPTILER_KEY ? (
                <View style={[styles.mapWrapper, mapWrapperDynamicStyle]}>
                  <MapTilerInteractiveMap
                    center={searchCenter}
                    radiusMiles={Number(search?.Radius ?? search?.radius ?? 5) || 5}
                    apiKey={MAPTILER_KEY}
                    zoom={12}
                    styleId="streets-v4"
                    centerMarker="house"
                    centerMarkerColor={palette.primary}
                    centerMarkerSize={14}
                    radiusVisualScale={0.68}
                    markerSize={16}
                    markers={
                      selectedLocation
                        ? [
                            {
                              id: 'selected-sighting',
                              latitude: selectedLocation.latitude,
                              longitude: selectedLocation.longitude,
                              label: confidence ? String(confidence) : '!',
                              color: getConfidenceColor(confidence || 3),
                              textColor: getConfidenceTextColor(confidence || 3),
                            },
                          ]
                        : []
                    }
                    onMapPress={setSelectedLocation}
                    onInteractionChange={setIsMapInteracting}
                    containerStyle={styles.mapTilesLayer}
                  />
                </View>
              ) : (
                <View style={[styles.placeholderBox, placeholderBoxDynamicStyle]}>
                  <ThemedText style={[styles.placeholderTitle, { color: palette.text }]}>Map Unavailable</ThemedText>
                  <ThemedText style={[styles.placeholderText, { color: palette.textSecondary }]}>This search is missing a valid map center or the MapTiler key is unavailable.</ThemedText>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitButton, styles.minTouchTarget, { backgroundColor: palette.primary }]}
              onPress={handleSubmit}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Submit sighting"
              accessibilityHint="Submits your confidence, details and selected location">
              <ThemedText style={styles.submitButtonText}>{saving ? 'Submitting...' : 'Submit Sighting'}</ThemedText>
            </TouchableOpacity>
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
    gap: 10,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0a5df0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  sectionCard: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#f5f9fd',
    borderWidth: 1,
    borderColor: '#c6d4e0',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1d3348',
  },
  sectionHelp: {
    fontSize: 14,
    color: '#4a657c',
    lineHeight: 20,
  },
  confidenceRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  confidenceChip: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#0a5df0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  confidenceChipText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0a5df0',
  },
  detailsInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#c6d4e0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },
  useLocationButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0a5df0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  useLocationButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  locationText: {
    fontSize: 13,
    color: '#37536B',
  },
  mapWrapper: {
    width: '100%',
    height: 360,
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
  submitButton: {
    backgroundColor: '#0a5df0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  placeholderBox: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: '#f1f4f8',
    borderWidth: 1,
    borderColor: '#d4dbe2',
    gap: 6,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#243746',
  },
  placeholderText: {
    fontSize: 14,
    color: '#526471',
    lineHeight: 20,
  },
});
