import React, { useEffect, useState } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '../../src/services/firebaseConfig';
import { getUserSearches } from '../../src/services/userService';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function SearchesScreen() {
  const [searches, setSearches] = useState<any>([]);
  const [selectedSearch, setSelectedSearch] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSearches() {
      try {
        const searchesData = await getUserSearches(db, 'test@gmail.com');
        setSearches(searchesData);
      } catch (error) {
        console.error('Error loading searches:', error);
      } finally {
        setLoading(false);
      }
    }
    loadSearches();
  }, []);

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
              <TouchableOpacity
                key={search.id}
                style={styles.searchCard}
                onPress={() => setSelectedSearch(search)}
              >
                <ThemedText style={styles.searchStatus}>{search.status ?? 'Unnamed search'}</ThemedText>
                <ThemedText>Owner: {search.owner}</ThemedText>
              </TouchableOpacity>
            ))}

            {selectedSearch && (
              <ThemedView style={styles.selectedSection}>
                <ThemedText type="subtitle" style={styles.selectedTitle}>Search Details</ThemedText>
                <ThemedText>ID: {selectedSearch.id}</ThemedText>
                <ThemedText>Status: {selectedSearch.status}</ThemedText>
                <ThemedText>Owner: {selectedSearch.owner}</ThemedText>
              </ThemedView>
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
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  searchCard: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  searchStatus: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  selectedSection: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderTopWidth: 2,
    borderTopColor: '#333',
  },
  selectedTitle: {
    marginBottom: 8,
  },
});
