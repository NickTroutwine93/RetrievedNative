import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapTilerTileMap } from '../../components/maptiler-tile-map';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { auth, db } from '../../src/services/firebaseClient';
import { getUserData } from '../../src/services/userService';

const MAP_ZOOM = 12;
const DEFAULT_RADIUS_MILES = 5;
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;

export default function MapScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);

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
      setRadiusMiles(Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : DEFAULT_RADIUS_MILES);
    } catch (err: any) {
      setCenter(null);
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

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>Searches in Area</ThemedText>
      </ThemedView>

      <View style={styles.mapContainer}>
        {loading && <ActivityIndicator size="large" color="#0076C0" />}

        {!loading && !MAPTILER_KEY && (
          <View style={styles.placeholderBox}>
            <ThemedText style={styles.placeholderText}>MapTiler API Key Missing</ThemedText>
            <ThemedText style={styles.infoText}>Set EXPO_PUBLIC_MAPTILER_API_KEY to display the map widget.</ThemedText>
          </View>
        )}

        {!loading && Boolean(error) && (
          <View style={styles.placeholderBox}>
            <ThemedText style={styles.placeholderText}>Map Unavailable</ThemedText>
            <ThemedText style={styles.infoText}>{error}</ThemedText>
          </View>
        )}

        {showMap && (
          <View style={styles.mapWidget}>
            <MapTilerTileMap
              center={center!}
              radiusMiles={radiusMiles}
              apiKey={MAPTILER_KEY!}
              zoom={MAP_ZOOM}
              styleId="streets-v4"
              containerStyle={styles.mapTilesLayer}
            />

            <View style={styles.mapMetaCard}>
              <ThemedText style={styles.metaText}>Center: {centerLatitude.toFixed(6)}, {centerLongitude.toFixed(6)}</ThemedText>
              <ThemedText style={styles.metaText}>Radius: {radiusMiles} miles</ThemedText>
            </View>
          </View>
        )}

        {!loading && showMap && (
          <ThemedText style={styles.creditText}>Map tiles by MapTiler, data by OpenStreetMap contributors.</ThemedText>
        )}
      </View>
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
    justifyContent: 'center',
    alignItems: 'center',
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
    height: '100%',
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
});
