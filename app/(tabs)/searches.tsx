import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, ScrollView, TouchableOpacity, View, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { auth, db } from '../../src/services/firebaseClient';
import { endSearch, getActiveSearches, getUserData, getUserSearchHistory, getUserSearches } from '../../src/services/userService';

const petImageSources: Record<string, any> = {
  'Rigby.jpg': require('../../assets/pets/Rigby.jpg'),
  'Taz.jpg': require('../../assets/pets/Taz.jpg'),
};

export default function SearchesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const [account, setAccount] = useState<any>(null);
  const [ownSearches, setOwnSearches] = useState<any[]>([]);
  const [joinedSearches, setJoinedSearches] = useState<any[]>([]);
  const [historySearches, setHistorySearches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [relativeTimeTick, setRelativeTimeTick] = useState(Date.now());
  const [endingSearch, setEndingSearch] = useState<any>(null);
  const [isEndingSearch, setIsEndingSearch] = useState(false);
  const [ownExpanded, setOwnExpanded] = useState(true);
  const [joinedExpanded, setJoinedExpanded] = useState(true);
  const [previousOwnedExpanded, setPreviousOwnedExpanded] = useState(false);
  const [previousJoinedExpanded, setPreviousJoinedExpanded] = useState(false);
  const searchCardDynamicStyle = { borderColor: palette.border, backgroundColor: palette.surface };
  const petImagePlaceholderDynamicStyle = { backgroundColor: palette.surfaceMuted };
  const sectionHeaderCardStyle = { borderColor: palette.border, backgroundColor: palette.surfaceMuted };
  const sectionBodyCardStyle = { borderColor: palette.border, backgroundColor: palette.surface };
  const sectionChevronWrapStyle = { backgroundColor: palette.surface, borderColor: palette.border };
  const sectionHintStyle = { color: palette.textSecondary };

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
        setAccount(null);
        setOwnSearches([]);
        setJoinedSearches([]);
        setHistorySearches([]);
        return;
      }

      const [searchesData, account, activeSearches, historyData] = await Promise.all([
        getUserSearches(db, signedInEmail),
        getUserData(db, signedInEmail),
        getActiveSearches(db),
        getUserSearchHistory(db, signedInEmail),
      ]);

      const userId = account?.id || '';
      const joined = activeSearches.filter((search: any) => {
        const ownerId = search?.owner ?? search?.OwnerID;
        const searcherIds = Array.isArray(search?.searchers)
          ? search.searchers
          : Array.isArray(search?.Searchers)
          ? search.Searchers
          : [];

        return Boolean(userId && ownerId !== userId && searcherIds.includes(userId));
      });

      setAccount(account || null);
      setOwnSearches(searchesData);
      setJoinedSearches(joined);
      setHistorySearches(historyData);
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
      setOwnSearches((prev: any[]) => prev.filter((search) => search.id !== endingSearch.id));
      setJoinedSearches((prev: any[]) => prev.filter((search) => search.id !== endingSearch.id));
      setEndingSearch(null);
      Alert.alert('Search ended', wasSuccessful ? 'The search was marked as found.' : 'The search was closed as not found.');
    } catch (error: any) {
      Alert.alert('End search failed', error?.message || 'Unable to end this search right now.');
    } finally {
      setIsEndingSearch(false);
    }
  };

  const renderSearchCards = (items: any[], canEndSearch: boolean) => {
    if (items.length === 0) {
      return null;
    }

    return items.map((search: any) => (
      <View key={search.id} style={[styles.searchCard, searchCardDynamicStyle]}>
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
          </View>
        </View>

        <TouchableOpacity
          style={[styles.openSearchButton, styles.minTouchTarget, { backgroundColor: palette.primary }]}
          onPress={() => router.push({ pathname: '/search/[id]', params: { id: search.id } } as any)}
          accessibilityRole="button"
          accessibilityLabel={`Open details for ${search?.pet?.Name || 'search'}`}>
          <ThemedText style={styles.openSearchButtonText}>Open Details</ThemedText>
        </TouchableOpacity>

        {canEndSearch ? (
          <TouchableOpacity
            style={[styles.endSearchButton, styles.minTouchTarget, { backgroundColor: palette.danger }]}
            onPress={() => setEndingSearch(search)}
            accessibilityRole="button"
            accessibilityLabel={`End search for ${search?.pet?.Name || 'pet'}`}>
            <ThemedText style={styles.endSearchButtonText}>End Search</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>
    ));
  };

  const renderHistoryCards = (items: any[]) => {
    if (items.length === 0) {
      return null;
    }

    return items.map((search: any) => {
      const successful = Number(search?.Successful ?? search?.Successfull);
      const outcome = successful === 1 ? 'Found' : successful === 0 ? 'Not Found' : 'Ended';

      return (
        <View key={search.id} style={[styles.searchCard, searchCardDynamicStyle]}>
          <View style={styles.petCardHeader}>
            <ThemedText style={[styles.petName, { color: palette.text }]}>{search?.pet?.Name || 'Unnamed pet'}</ThemedText>
            <ThemedText style={[styles.searchAge, { color: palette.textSecondary }]}>{formatTimeSinceSearch(search?.Date ?? search?.date)}</ThemedText>
            <ThemedText style={[styles.searchStatus, { color: palette.textSecondary }]}>Result: {outcome}</ThemedText>
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
            </View>
          </View>

          <TouchableOpacity
            style={[styles.openSearchButton, styles.minTouchTarget, { backgroundColor: palette.primary }]}
            onPress={() => router.push({ pathname: '/search/[id]', params: { id: search.id } } as any)}
            accessibilityRole="button"
            accessibilityLabel={`Open details for ${search?.pet?.Name || 'search'}`}>
            <ThemedText style={styles.openSearchButtonText}>Open Details</ThemedText>
          </TouchableOpacity>
        </View>
      );
    });
  };

  const historyOwnedSearches = historySearches.filter((search) => {
    const ownerId = search?.owner ?? search?.OwnerID;
    return Boolean(account?.id && ownerId === account.id);
  });

  const historyJoinedSearches = historySearches.filter((search) => {
    const ownerId = search?.owner ?? search?.OwnerID;
    return Boolean(account?.id && ownerId !== account.id);
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]}>
      <ThemedView style={[styles.header, { borderBottomColor: palette.border, backgroundColor: palette.surface }]}>
        <ThemedText type="title" style={styles.headerTitle}>Your Searches</ThemedText>
      </ThemedView>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ThemedText>Loading...</ThemedText>
        ) : (
          <>
            <View style={styles.sectionContainer}>
              <TouchableOpacity
                style={[styles.sectionHeaderButton, sectionHeaderCardStyle, ownExpanded && styles.sectionHeaderButtonExpanded, styles.minTouchTarget]}
                onPress={() => setOwnExpanded((prev) => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Your pets searches section, ${ownSearches.length} items`}
                accessibilityState={{ expanded: ownExpanded }}>
                <View style={styles.sectionHeaderContent}>
                  <View style={styles.sectionHeaderTextWrap}>
                    <ThemedText style={[styles.sectionHeader, { color: palette.text }]}>Your Pets ({ownSearches.length})</ThemedText>
                    {!ownExpanded ? <ThemedText style={[styles.sectionHintText, sectionHintStyle]}>Tap to expand</ThemedText> : null}
                  </View>
                  <View style={[styles.sectionChevronWrap, sectionChevronWrapStyle]}>
                    <IconSymbol
                      size={18}
                      name="chevron.right"
                      color={palette.primary}
                      style={ownExpanded ? styles.sectionChevronIconExpanded : undefined}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {ownExpanded ? (
                <View style={[styles.sectionBody, sectionBodyCardStyle]}>
                  {ownSearches.length === 0 ? (
                    <ThemedText style={[styles.emptySectionText, { color: palette.textMuted }]}>You have no active searches for your pets.</ThemedText>
                  ) : (
                    renderSearchCards(ownSearches, true)
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.sectionContainer}>
              <TouchableOpacity
                style={[styles.sectionHeaderButton, sectionHeaderCardStyle, joinedExpanded && styles.sectionHeaderButtonExpanded, styles.minTouchTarget]}
                onPress={() => setJoinedExpanded((prev) => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Joined searches section, ${joinedSearches.length} items`}
                accessibilityState={{ expanded: joinedExpanded }}>
                <View style={styles.sectionHeaderContent}>
                  <View style={styles.sectionHeaderTextWrap}>
                    <ThemedText style={[styles.sectionHeader, { color: palette.text }]}>Searches Joined ({joinedSearches.length})</ThemedText>
                    {!joinedExpanded ? <ThemedText style={[styles.sectionHintText, sectionHintStyle]}>Tap to expand</ThemedText> : null}
                  </View>
                  <View style={[styles.sectionChevronWrap, sectionChevronWrapStyle]}>
                    <IconSymbol
                      size={18}
                      name="chevron.right"
                      color={palette.primary}
                      style={joinedExpanded ? styles.sectionChevronIconExpanded : undefined}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {joinedExpanded ? (
                <View style={[styles.sectionBody, sectionBodyCardStyle]}>
                  {joinedSearches.length === 0 ? (
                    <ThemedText style={[styles.emptySectionText, { color: palette.textMuted }]}>You have not joined any active searches.</ThemedText>
                  ) : (
                    renderSearchCards(joinedSearches, false)
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.sectionContainer}>
              <TouchableOpacity
                style={[styles.sectionHeaderButton, sectionHeaderCardStyle, previousOwnedExpanded && styles.sectionHeaderButtonExpanded, styles.minTouchTarget]}
                onPress={() => setPreviousOwnedExpanded((prev) => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Previously owned searches section, ${historyOwnedSearches.length} items`}
                accessibilityState={{ expanded: previousOwnedExpanded }}>
                <View style={styles.sectionHeaderContent}>
                  <View style={styles.sectionHeaderTextWrap}>
                    <ThemedText style={[styles.sectionHeader, { color: palette.text }]}>Previously Owned ({historyOwnedSearches.length})</ThemedText>
                    {!previousOwnedExpanded ? <ThemedText style={[styles.sectionHintText, sectionHintStyle]}>Tap to expand</ThemedText> : null}
                  </View>
                  <View style={[styles.sectionChevronWrap, sectionChevronWrapStyle]}>
                    <IconSymbol
                      size={18}
                      name="chevron.right"
                      color={palette.primary}
                      style={previousOwnedExpanded ? styles.sectionChevronIconExpanded : undefined}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {previousOwnedExpanded ? (
                <View style={[styles.sectionBody, sectionBodyCardStyle]}>
                  {historyOwnedSearches.length === 0 ? (
                    <ThemedText style={[styles.emptySectionText, { color: palette.textMuted }]}>No previously owned searches.</ThemedText>
                  ) : (
                    renderHistoryCards(historyOwnedSearches)
                  )}
                </View>
              ) : null}
            </View>

            <View style={styles.sectionContainer}>
              <TouchableOpacity
                style={[styles.sectionHeaderButton, sectionHeaderCardStyle, previousJoinedExpanded && styles.sectionHeaderButtonExpanded, styles.minTouchTarget]}
                onPress={() => setPreviousJoinedExpanded((prev) => !prev)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Previously joined searches section, ${historyJoinedSearches.length} items`}
                accessibilityState={{ expanded: previousJoinedExpanded }}>
                <View style={styles.sectionHeaderContent}>
                  <View style={styles.sectionHeaderTextWrap}>
                    <ThemedText style={[styles.sectionHeader, { color: palette.text }]}>Previously Joined ({historyJoinedSearches.length})</ThemedText>
                    {!previousJoinedExpanded ? <ThemedText style={[styles.sectionHintText, sectionHintStyle]}>Tap to expand</ThemedText> : null}
                  </View>
                  <View style={[styles.sectionChevronWrap, sectionChevronWrapStyle]}>
                    <IconSymbol
                      size={18}
                      name="chevron.right"
                      color={palette.primary}
                      style={previousJoinedExpanded ? styles.sectionChevronIconExpanded : undefined}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {previousJoinedExpanded ? (
                <View style={[styles.sectionBody, sectionBodyCardStyle]}>
                  {historyJoinedSearches.length === 0 ? (
                    <ThemedText style={[styles.emptySectionText, { color: palette.textMuted }]}>No previously joined searches.</ThemedText>
                  ) : (
                    renderHistoryCards(historyJoinedSearches)
                  )}
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      <Modal animationType="fade" transparent={true} visible={Boolean(endingSearch)} onRequestClose={() => !isEndingSearch && setEndingSearch(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: palette.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: palette.surface, borderColor: palette.border }] }>
            <ThemedText type="title" style={styles.modalTitle}>End Search</ThemedText>
            <ThemedText style={[styles.modalBody, { color: palette.textSecondary }]}>
              Was {endingSearch?.pet?.Name ?? 'this pet'} found?
            </ThemedText>

            <TouchableOpacity style={[styles.foundButton, { backgroundColor: palette.success }]} onPress={() => handleFinishSearch(true)} disabled={isEndingSearch}>
              <ThemedText style={styles.modalButtonText}>{isEndingSearch ? 'Saving...' : 'Found'}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.notFoundButton, { backgroundColor: palette.danger }]} onPress={() => handleFinishSearch(false)} disabled={isEndingSearch}>
              <ThemedText style={styles.modalButtonText}>{isEndingSearch ? 'Saving...' : 'Not Found'}</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.cancelButton, { backgroundColor: palette.textMuted }]} onPress={() => setEndingSearch(null)} disabled={isEndingSearch}>
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
    gap: 16,
  },
  sectionContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeaderButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionHeaderButtonExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  sectionHintText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  sectionChevronIconExpanded: {
    transform: [{ rotate: '-90deg' }],
  },
  sectionBody: {
    padding: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderTopWidth: 0,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '800',
  },
  emptySectionText: {
    fontSize: 14,
    color: '#4E5B63',
    marginBottom: 2,
  },
  searchCard: {
    padding: 14,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C6D4E3',
    backgroundColor: '#FFFFFF',
  },
  petCardHeader: {
    marginBottom: 8,
  },
  petName: {
    fontWeight: 'bold',
    fontSize: 22,
    color: '#13283B',
    marginBottom: 4,
  },
  searchAge: {
    fontSize: 12,
    color: '#0B5CAB',
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
    backgroundColor: '#EAF1F8',
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
    color: '#3F5568',
  },
  openSearchButton: {
    backgroundColor: '#0B5CAB',
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
    backgroundColor: '#8F2D2D',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 10,
  },
  minTouchTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  endSearchButtonText: {
    color: '#fff',
    fontWeight: 'bold',
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
