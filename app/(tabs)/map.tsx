import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';

export default function MapScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>Searches in Area</ThemedText>
      </ThemedView>

      <View style={styles.mapContainer}>
        <View style={styles.placeholderBox}>
          <ThemedText style={styles.placeholderText}>Map Integration Placeholder</ThemedText>
          <ThemedText style={styles.infoText}>
            Ready for react-native-maps integration with:
          </ThemedText>
          <ThemedText style={styles.listItem}>• Live location tracking</ThemedText>
          <ThemedText style={styles.listItem}>• Search area markers</ThemedText>
          <ThemedText style={styles.listItem}>• Radius visualization</ThemedText>
          <ThemedText style={styles.listItem}>• Nearby search listings</ThemedText>
        </View>
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
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  listItem: {
    fontSize: 13,
    marginVertical: 4,
  },
});
