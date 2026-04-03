import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, ScrollView, TouchableOpacity, View, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { auth, db } from '../../src/services/firebaseClient';
import { endSearch, getUserSearches } from '../../src/services/userService';

const petImageSources: Record<string, any> = {
  'Rigby.jpg': require('../../assets/pets/Rigby.jpg'),
  'Taz.jpg': require('../../assets/pets/Taz.jpg'),
};

export default function SearchesScreen() {
  const [searches, setSearches] = useState<any>([]);
  const [loading, setLoading] = useState(true);
  const [relativeTimeTick, setRelativeTimeTick] = useState(Date.now());
  const [endingSearch, setEndingSearch] = useState<any>(null);
  const [isEndingSearch, setIsEndingSearch] = useState(false);

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

  const loadSearches = useCallback(async () => {
    setLoading(true);
    try {
      const signedInEmail = auth.currentUser?.email;
      if (!signedInEmail) {
        setSearches([]);
        return;
      }

      const searchesData = await getUserSearches(db, signedInEmail);
      setSearches(searchesData);
    } catch (error) {
      console.error('Error loading searches:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSearches();
    }, [loadSearches])
  );

  const handleFinishSearch = async (wasSuccessful: boolean) => {
    if (!endingSearch?.id) {
      return;
    }

    try {
      setIsEndingSearch(true);
      await endSearch(db, endingSearch.id, wasSuccessful);
      setSearches((prev: any[]) => prev.filter((search) => search.id !== endingSearch.id));
      setEndingSearch(null);
      Alert.alert('Search ended', wasSuccessful ? 'The search was marked as found.' : 'The search was closed as not found.');
    } catch (error: any) {
      Alert.alert('End search failed', error?.message || 'Unable to end this search right now.');
    } finally {
      setIsEndingSearch(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>Your Searches</ThemedText>
      </ThemedView>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ThemedText>Loading...</ThemedText>
        ) : searches.length === 0 ? (
          <ThemedText>No searches found</ThemedText>
        ) : (
          <>
            {searches.map((search: any) => (
              <View key={search.id} style={styles.searchCard}>
                <View style={styles.petCardHeader}>
                  <ThemedText style={styles.petName}>{search?.pet?.Name || 'Unnamed pet'}</ThemedText>
                  <ThemedText style={styles.searchAge}>{formatTimeSinceSearch(search?.Date ?? search?.date)}</ThemedText>
                  <ThemedText style={styles.searchStatus}>Search status: {search.status ?? search.Status ?? 'Unknown'}</ThemedText>
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
                    <View style={styles.petImagePlaceholder}>
                      <ThemedText style={styles.petImageText}>No image</ThemedText>
                    </View>
                  )}

                  <View style={styles.petDetails}>
                    <ThemedText>Breed: {search?.pet?.Breed ?? 'Unknown'}</ThemedText>
                    <ThemedText>Color: {Array.isArray(search?.pet?.Color) ? search.pet.Color.join(', ') : search?.pet?.Color ?? 'Unknown'}</ThemedText>
                    <ThemedText>Size: {search?.pet?.Size ?? 'Unknown'}</ThemedText>
                  </View>
                </View>

                <TouchableOpacity style={styles.openSearchButton} onPress={() => router.push({ pathname: '/search/[id]', params: { id: search.id } } as any)}>
                  <ThemedText style={styles.openSearchButtonText}>Open Details</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity style={styles.endSearchButton} onPress={() => setEndingSearch(search)}>
                  <ThemedText style={styles.endSearchButtonText}>End Search</ThemedText>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal animationType="fade" transparent={true} visible={Boolean(endingSearch)} onRequestClose={() => !isEndingSearch && setEndingSearch(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>End Search</ThemedText>
            <ThemedText style={styles.modalBody}>
              Was {endingSearch?.pet?.Name ?? 'this pet'} found?
            </ThemedText>

            <TouchableOpacity style={styles.foundButton} onPress={() => handleFinishSearch(true)} disabled={isEndingSearch}>
              <ThemedText style={styles.modalButtonText}>{isEndingSearch ? 'Saving...' : 'Found'}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.notFoundButton} onPress={() => handleFinishSearch(false)} disabled={isEndingSearch}>
              <ThemedText style={styles.modalButtonText}>{isEndingSearch ? 'Saving...' : 'Not Found'}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setEndingSearch(null)} disabled={isEndingSearch}>
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  searchCard: {
    padding: 14,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7a8a8f',
    backgroundColor: '#BFCECF',
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
  searchStatus: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#37536B',
  },
  openSearchButton: {
    backgroundColor: '#1F4F8F',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 12,
  },
  openSearchButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  endSearchButton: {
    backgroundColor: '#8F3B1F',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 10,
  },
  endSearchButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: '#5a5a5a',
    marginBottom: 14,
    lineHeight: 20,
  },
  foundButton: {
    backgroundColor: '#2f8f4e',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  notFoundButton: {
    backgroundColor: '#8F3B1F',
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
    backgroundColor: '#999',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
