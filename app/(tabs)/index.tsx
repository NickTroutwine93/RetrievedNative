import React, { useEffect, useState } from 'react';
import { StyleSheet, ScrollView, View, Image, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapTilerTileMap } from '@/components/maptiler-tile-map';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { auth, db } from '../../src/services/firebaseClient';
import { getUserData, getUserPets, updatePet, addPet, deactivatePet, updateUserProfile, createSearch, getUserSearches } from '../../src/services/userService';

const petImageSources: Record<string, any> = {
  'Rigby.jpg': require('../../assets/pets/Rigby.jpg'),
  'Taz.jpg': require('../../assets/pets/Taz.jpg'),
};
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;
const PET_SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL'];
const PET_COLOR_OPTIONS = [
  'Black',
  'White',
  'Brown',
  'Tan',
  'Cream',
  'Fawn',
  'Red',
  'Golden',
  'Gray',
  'Silver',
  'Blue',
  'Liver',
  'Chocolate',
  'Brindle',
  'Merle',
  'Sable',
  'Apricot',
  'Rust',
  'Bicolor',
  'Tricolor',
  'Parti-color',
  'Mahogany',
];

export default function HomeScreen() {
  const [user, setUser] = useState<any>(null);
  const [pets, setPets] = useState<any>([]);
  const [loading, setLoading] = useState(true);
  const [editingPet, setEditingPet] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBreed, setEditBreed] = useState('');
  const [editColors, setEditColors] = useState<string[]>([]);
  const [editSize, setEditSize] = useState('');
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [editImage, setEditImage] = useState('');
  const [editImageType, setEditImageType] = useState('');
  const [editImageUri, setEditImageUri] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileRadius, setProfileRadius] = useState('5');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileAddressTouched, setProfileAddressTouched] = useState(false);
  const [profileGeocodedAddress, setProfileGeocodedAddress] = useState('');
  const [profileAddressError, setProfileAddressError] = useState('');
  const [profileAddressSuggestions, setProfileAddressSuggestions] = useState<Array<{ displayName: string; latitude: number; longitude: number }>>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [addressGuidanceText, setAddressGuidanceText] = useState('');
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [profileCoordinates, setProfileCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [creatingSearchPetId, setCreatingSearchPetId] = useState<string | null>(null);
  const [activeSearchesByPet, setActiveSearchesByPet] = useState<Record<string, any>>({});
  const [relativeTimeTick, setRelativeTimeTick] = useState(Date.now());

  type PetRecord = {
    id?: string;
    docId?: string;
    OwnerID?: string;
    Name?: string;
    Breed?: string;
    Color?: string[] | string;
    Size?: string;
    Image?: string;
    ImageType?: string;
    Status?: number;
  };

  type UserLocation = {
    latitude: number;
    longitude: number;
  };

  type AddressSuggestion = {
    displayName: string;
    latitude: number;
    longitude: number;
  };

  const loadUserData = async () => {
    try {
      setLoading(true);
      const signedInEmail = auth.currentUser?.email;
      if (!signedInEmail) {
        setUser(null);
        setPets([]);
        setActiveSearchesByPet({});
        return;
      }

      const account = await getUserData(db, signedInEmail);
      setUser(account);

      if (account?.id) {
        const [petsData, searchesData] = await Promise.all([
          getUserPets(db, account.id),
          getUserSearches(db, signedInEmail),
        ]);
        setPets(petsData);

        const nextActiveSearches = searchesData.reduce((acc: Record<string, any>, search: any) => {
          const petId = search.petID ?? search.PetID;
          const status = search.status ?? search.Status;
          if (petId && status === 1) {
            acc[petId] = search;
          }
          return acc;
        }, {});
        setActiveSearchesByPet(nextActiveSearches);
      } else {
        setPets([]);
        setActiveSearchesByPet({});
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUserData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadUserData();
    }, [])
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setRelativeTimeTick(Date.now());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!profileModalVisible) {
      setProfileAddressSuggestions([]);
      setIsSearchingAddress(false);
      setAddressGuidanceText('');
      return;
    }

    const queryText = profileAddress.trim();
    if (!profileAddressTouched || queryText.length < 3) {
      setProfileAddressSuggestions([]);
      setIsSearchingAddress(false);
      if (profileAddressTouched && queryText.length > 0 && queryText.length < 3) {
        setAddressGuidanceText('Keep typing: include street number, street name, city, and state/province.');
      } else {
        setAddressGuidanceText('');
      }
      return;
    }

    const debounceHandle = setTimeout(async () => {
      try {
        setIsSearchingAddress(true);
        const suggestions = await lookupAddressSuggestions(queryText);
        setProfileAddressSuggestions(suggestions);

        if (suggestions.length === 0) {
          setAddressGuidanceText('No matches yet. Try a more specific address: house number + street + city + state/province (+ postal code).');
        } else {
          setAddressGuidanceText('');
        }
      } catch {
        setProfileAddressSuggestions([]);
        setAddressGuidanceText('Address search is unavailable right now. Enter a full address and use Save to geocode it.');
      } finally {
        setIsSearchingAddress(false);
      }
    }, 350);

    return () => clearTimeout(debounceHandle);
  }, [profileAddress, profileAddressTouched, profileModalVisible]);

  const openEditModal = (pet: PetRecord) => {
    setIsAddMode(false);
    setEditingPet(pet);
    setShowRemoveConfirm(false);
    setEditName(pet.Name ?? '');
    setEditBreed(pet.Breed ?? '');
    const incomingColors = Array.isArray(pet.Color)
      ? pet.Color
      : String(pet.Color ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
    setEditColors(incomingColors);
    setEditSize(pet.Size ?? '');
    setShowSizeDropdown(false);
    setShowColorDropdown(false);
    setEditImage(pet.Image ?? '');
    setEditImageType(pet.ImageType ?? '');
    setEditImageUri('');
    setModalVisible(true);
  };

  const openProfileModal = () => {
    setProfileFirstName(user?.firstName ?? user?.FirstName ?? '');
    setProfileLastName(user?.lastName ?? user?.LastName ?? '');
    setProfileRadius(String(user?.radius ?? user?.Radius ?? 5));
    setProfileAddress('');
    setProfileAddressTouched(false);
    setProfileGeocodedAddress('');
    setProfileAddressError('');
    setProfileAddressSuggestions([]);
    setAddressGuidanceText('');
    setProfileCoordinates(user?.location ? { latitude: user.location.latitude, longitude: user.location.longitude } : null);
    setProfileModalVisible(true);
  };

  const openAddModal = () => {
    setIsAddMode(true);
    setEditingPet(null);
    setShowRemoveConfirm(false);
    setEditName('');
    setEditBreed('');
    setEditColors([]);
    setEditSize('');
    setShowSizeDropdown(false);
    setShowColorDropdown(false);
    setEditImage('');
    setEditImageType('');
    setEditImageUri('');
    setModalVisible(true);
  };

  const closeEditModal = () => {
    setModalVisible(false);
    setEditingPet(null);
    setIsAddMode(false);
    setShowRemoveConfirm(false);
    setShowSizeDropdown(false);
    setShowColorDropdown(false);
  };

  const toggleColor = (color: string) => {
    setEditColors((prev) =>
      prev.includes(color)
        ? prev.filter((item) => item !== color)
        : [...prev, color]
    );
  };

  const closeProfileModal = () => {
    setProfileModalVisible(false);
    setProfileFirstName('');
    setProfileLastName('');
    setProfileRadius('5');
    setProfileAddress('');
    setProfileAddressTouched(false);
    setProfileGeocodedAddress('');
    setProfileAddressError('');
    setProfileAddressSuggestions([]);
    setAddressGuidanceText('');
    setProfileCoordinates(null);
  };

  const geocodeAddress = async (addressText: string): Promise<UserLocation | null> => {
    const geocodeResults = await Location.geocodeAsync(addressText);
    const firstMatch = geocodeResults[0];

    if (!firstMatch) {
      return null;
    }

    return {
      latitude: firstMatch.latitude,
      longitude: firstMatch.longitude,
    };
  };

  const formatSuggestionDisplayName = (item: any): string => {
    const address = item?.address || {};
    const line1 = [
      address.house_number,
      address.road || address.pedestrian || address.footway,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    const locality =
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.municipality ||
      address.locality;

    const parts = [
      line1 || address.road || address.pedestrian || address.footway,
      locality,
      address.state || address.state_district,
      address.postcode,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(', ');
    }

    const excludedSegments = new Set(
      [address.county, address.neighbourhood, address.neighborhood]
        .filter(Boolean)
        .map((value: any) => String(value).toLowerCase())
    );

    return String(item?.display_name || '')
      .split(',')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0 && !excludedSegments.has(segment.toLowerCase()))
      .join(', ');
  };

  const lookupAddressSuggestions = async (queryText: string): Promise<AddressSuggestion[]> => {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(queryText)}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RetrievedNative/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Address search failed with status ${response.status}`);
    }

    const json = await response.json();
    if (!Array.isArray(json)) {
      return [];
    }

    return json
      .map((item: any) => ({
        displayName: formatSuggestionDisplayName(item),
        latitude: Number(item.lat),
        longitude: Number(item.lon),
      }))
      .filter((item: AddressSuggestion) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && item.displayName);
  };

  const selectAddressSuggestion = (suggestion: AddressSuggestion) => {
    setProfileAddress(suggestion.displayName);
    setProfileAddressTouched(true);
    setProfileGeocodedAddress(suggestion.displayName);
    setProfileAddressSuggestions([]);
    setAddressGuidanceText('');
    setProfileAddressError('');
    setProfileCoordinates({
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    });
  };

  const previewTypedAddress = async () => {
    const trimmedAddress = profileAddress.trim();
    if (!profileAddressTouched || trimmedAddress.length === 0) {
      return;
    }

    try {
      setIsGeocodingAddress(true);
      const resolvedLocation = await geocodeAddress(trimmedAddress);

      if (!resolvedLocation) {
        setProfileAddressError('Could not find that address. Please enter a more complete address.');
        return;
      }

      setProfileCoordinates(resolvedLocation);
      setProfileGeocodedAddress(trimmedAddress);
      setProfileAddressError('');
    } catch (error: any) {
      setProfileAddressError(error?.message || 'Address lookup failed. Please try again.');
    } finally {
      setIsGeocodingAddress(false);
    }
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Permission to access media library is required to choose a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled) {
      const uri = (result as any).uri || (result as any).assets?.[0]?.uri;
      if (!uri) {
        Alert.alert('Error', 'Could not get image URI from picker result.');
        return;
      }

      const fileName = uri.split('/').pop() || `photo-${Date.now()}.jpg`;
      const fileType = (result as any).type || 'image';
      setEditImage(fileName);
      setEditImageType(fileType);
      setEditImageUri(uri);
    }
  };

  const removePet = async (targetPet?: PetRecord) => {
    const activePet = targetPet || editingPet;
    const petDocId = activePet?.docId || activePet?.id;

    if (!petDocId) {
      Alert.alert('Error', 'Pet document id is missing, cannot remove this pet.');
      return;
    }

    try {
      setIsSubmitting(true);
      await deactivatePet(db, petDocId);
      setPets((prev: PetRecord[]) => prev.filter((pet) => (pet.docId || pet.id) !== petDocId));
      closeEditModal();
      Alert.alert('Deactivated', `${activePet?.Name ?? 'Pet'} has been removed from active pets.`);
    } catch (error: any) {
      console.error('Error removing pet:', error);
      Alert.alert('Remove failed', error?.message || 'Unknown remove error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const savePetChanges = async () => {
    const petDocId = editingPet?.docId || editingPet?.id;
    const colorArray = editColors;

    const updates: any = {
      Name: editName || '',
      Breed: editBreed || '',
      Color: colorArray,
      Size: editSize || '',
      Image: editImage || '',
      ImageType: editImageType || '',
    };

    try {
      setIsSubmitting(true);
      if (isAddMode) {
        if (!user?.id) {
          Alert.alert('Error', 'User account not loaded');
          return;
        }
        const newPet = await addPet(db, user.id, updates);
        setPets((prev: PetRecord[]) => [...prev, { ...newPet, Name: editName, Breed: editBreed, Color: updates.Color, Size: editSize, Image: editImage, ImageType: editImageType, Status: 1 }]);
      } else if (editingPet && petDocId) {
        await updatePet(db, petDocId, updates);
        setPets((prev: PetRecord[]) => prev.map((pet) => ((pet.docId || pet.id) === petDocId ? { ...pet, ...updates, Name: editName, Breed: editBreed, Color: updates.Color, Size: editSize, Image: editImage, ImageType: editImageType } : pet)));
      }
      closeEditModal();
    } catch (error: any) {
      console.error('Error saving pet changes:', error);
      Alert.alert('Save failed', error?.message || 'Unknown save error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeletePet = (pet?: PetRecord) => {
    const activePet = pet || editingPet;

    if (!activePet) {
      Alert.alert('Error', 'No pet selected for removal.');
      return;
    }

    setShowRemoveConfirm(true);
  };

  const useCurrentLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Location permission is required to use your current location.');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({});
      const currentCoordinates = {
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      };

      setProfileCoordinates(currentCoordinates);
      setProfileGeocodedAddress('');
      setProfileAddressError('');
      setProfileAddressSuggestions([]);
      setAddressGuidanceText('');

      const reverseResults = await Location.reverseGeocodeAsync(currentCoordinates);
      const firstAddress = reverseResults[0];
      if (firstAddress) {
        const parts = [
          firstAddress.streetNumber,
          firstAddress.street,
          firstAddress.city,
          firstAddress.region,
          firstAddress.postalCode,
        ].filter(Boolean);
        setProfileAddress(parts.join(' '));
      }
    } catch (error: any) {
      Alert.alert('Location unavailable', error?.message || 'Could not get your current location.');
    }
  };

  const saveProfileChanges = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User account not loaded.');
      return;
    }

    try {
      setIsSavingProfile(true);

      let nextLocation: UserLocation | null = profileCoordinates;

      const wantsAddressUpdate = profileAddressTouched && profileAddress.trim().length > 0;

      if (wantsAddressUpdate) {
        const trimmedAddress = profileAddress.trim();
        const resolvedLocation =
          profileGeocodedAddress === trimmedAddress && profileCoordinates
            ? profileCoordinates
            : await geocodeAddress(trimmedAddress);

        if (!resolvedLocation) {
          setProfileAddressError('Could not find that address. Please enter a more complete address.');
          Alert.alert('Address not found', 'Enter a complete address or use your current location.');
          return;
        }

        nextLocation = resolvedLocation;
        setProfileCoordinates(nextLocation);
        setProfileGeocodedAddress(trimmedAddress);
        setProfileAddressError('');
      }

      // Fall back to current saved location so Save always issues a profile update call.
      if (!nextLocation && user?.location) {
        nextLocation = {
          latitude: user.location.latitude,
          longitude: user.location.longitude,
        };
      }

      if (!nextLocation) {
        Alert.alert('Missing location', 'Enter an address or choose Use My Location before saving.');
        return;
      }

      const savedProfile = await updateUserProfile(db, user.id, {
        firstName: profileFirstName.trim() || user?.firstName || user?.FirstName || '',
        lastName: profileLastName.trim() || user?.lastName || user?.LastName || '',
        radius: Number(profileRadius) || user?.radius || user?.Radius || 5,
        location: nextLocation,
      });

      setUser((prev: any) => ({
        ...prev,
        firstName: savedProfile.firstName ?? prev.firstName,
        FirstName: savedProfile.firstName ?? prev.FirstName,
        lastName: savedProfile.lastName ?? prev.lastName,
        LastName: savedProfile.lastName ?? prev.LastName,
        radius: savedProfile.radius ?? prev.radius,
        Radius: savedProfile.radius ?? prev.Radius,
        location: savedProfile.location ?? prev.location,
      }));
      closeProfileModal();
      Alert.alert('Profile updated', 'Your profile changes have been saved.');
    } catch (error: any) {
      Alert.alert('Update failed', error?.message || 'Could not update your profile location.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCreateSearch = async (pet: PetRecord) => {
    const petId = pet.docId || pet.id;
    const ownerId = pet.OwnerID || user?.id;
    const userLocation = user?.location;

    if (!petId) {
      Alert.alert('Missing pet', 'Pet record is missing its id.');
      return;
    }

    if (!ownerId) {
      Alert.alert('Missing owner', 'User account is not loaded yet.');
      return;
    }

    if (!userLocation?.latitude || !userLocation?.longitude) {
      Alert.alert('Missing location', 'Set your profile location before creating a search.');
      return;
    }

    try {
      setCreatingSearchPetId(petId);
      const createdSearch = await createSearch(db, {
        petId,
        ownerId,
        location: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        },
        radius: 5,
      });

      setUser((prev: any) => ({
        ...prev,
        YourSearches: [...(Array.isArray(prev?.YourSearches) ? prev.YourSearches : []), createdSearch.id],
      }));
      setActiveSearchesByPet((prev) => ({
        ...prev,
        [petId]: {
          ...createdSearch,
          petID: createdSearch.PetID,
          status: createdSearch.Status,
          pet: {
            id: petId,
            Name: pet.Name ?? '',
            Breed: pet.Breed ?? '',
            Color: pet.Color ?? [],
            Size: pet.Size ?? '',
            Image: pet.Image ?? null,
            ImageType: pet.ImageType ?? '',
          },
        },
      }));
      Alert.alert('Search created', `Created a new search for ${pet.Name ?? 'this pet'}.`);
      router.push('/(tabs)/searches' as any);
    } catch (error: any) {
      Alert.alert('Create search failed', error?.message || 'Unable to create search right now.');
    } finally {
      setCreatingSearchPetId(null);
    }
  };

  const openSearchDetails = (searchId?: string) => {
    if (!searchId) {
      Alert.alert('Search unavailable', 'Could not find that search.');
      return;
    }

    router.push({ pathname: '/search/[id]', params: { id: searchId } } as any);
  };

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
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={closeEditModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>{isAddMode ? 'Add Pet' : 'Edit Pet'}</ThemedText>
            <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Name" />
            <TextInput style={styles.input} value={editBreed} onChangeText={setEditBreed} placeholder="Breed" />

            <View style={styles.dropdownSection}>
              <ThemedText style={styles.dropdownLabel}>Size</ThemedText>
              <TouchableOpacity
                style={styles.selectorInput}
                onPress={() => {
                  setShowSizeDropdown((prev) => !prev);
                  setShowColorDropdown(false);
                }}>
                <ThemedText style={styles.selectorInputText}>{editSize || 'Select size'}</ThemedText>
              </TouchableOpacity>
              {showSizeDropdown && (
                <View style={styles.dropdownMenu}>
                  {PET_SIZE_OPTIONS.map((sizeOption) => (
                    <TouchableOpacity
                      key={sizeOption}
                      style={[styles.dropdownOption, editSize === sizeOption ? styles.dropdownOptionSelected : null]}
                      onPress={() => {
                        setEditSize(sizeOption);
                        setShowSizeDropdown(false);
                      }}>
                      <ThemedText style={styles.dropdownOptionText}>{sizeOption}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.dropdownSection}>
              <ThemedText style={styles.dropdownLabel}>Colors</ThemedText>
              <TouchableOpacity
                style={styles.selectorInput}
                onPress={() => {
                  setShowColorDropdown((prev) => !prev);
                  setShowSizeDropdown(false);
                }}>
                <ThemedText style={styles.selectorInputText}>
                  {editColors.length > 0 ? `${editColors.length} selected` : 'Select colors'}
                </ThemedText>
              </TouchableOpacity>
              {showColorDropdown && (
                <ScrollView style={styles.dropdownMenuTall} nestedScrollEnabled>
                  {PET_COLOR_OPTIONS.map((colorOption) => {
                    const isSelected = editColors.includes(colorOption);
                    return (
                      <TouchableOpacity
                        key={colorOption}
                        style={[styles.dropdownOption, isSelected ? styles.dropdownOptionSelected : null]}
                        onPress={() => toggleColor(colorOption)}>
                        <ThemedText style={styles.dropdownOptionText}>{isSelected ? `✓ ${colorOption}` : colorOption}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
              {editColors.length > 0 && (
                <ThemedText style={styles.selectionSummary}>{editColors.join(', ')}</ThemedText>
              )}
            </View>

            <TextInput style={styles.input} value={editImage} onChangeText={setEditImage} placeholder="Image filename" />

            <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
              <ThemedText style={styles.uploadButtonText}>Choose Photo</ThemedText>
            </TouchableOpacity>
            {editImageUri ? (
              <Image source={{ uri: editImageUri }} style={styles.previewImage} resizeMode="cover" />
            ) : petImageSources[editImage] ? (
              <Image source={petImageSources[editImage]} style={styles.previewImage} resizeMode="cover" />
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveButton} onPress={savePetChanges} disabled={isSubmitting}>
                <ThemedText style={styles.saveButtonText}>{isSubmitting ? 'Working...' : isAddMode ? 'Add' : 'Save'}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={closeEditModal} disabled={isSubmitting}>
                <ThemedText style={styles.cancelButtonText}>Dismiss</ThemedText>
              </TouchableOpacity>
            </View>

            {showRemoveConfirm && !isAddMode && (
              <View style={styles.confirmPanel}>
                <ThemedText style={styles.confirmTitle}>Are you sure?</ThemedText>
                <ThemedText style={styles.confirmBody}>Remove {editingPet?.Name ?? 'this pet'} from active pets?</ThemedText>
                <View style={styles.confirmActions}>
                  <TouchableOpacity style={styles.confirmCancelButton} onPress={() => setShowRemoveConfirm(false)} disabled={isSubmitting}>
                    <ThemedText style={styles.confirmCancelText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmRemoveButton} onPress={() => removePet(editingPet)} disabled={isSubmitting}>
                    <ThemedText style={styles.confirmRemoveText}>{isSubmitting ? 'Removing...' : 'Remove'}</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!isAddMode && (
              <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDeletePet(editingPet)} disabled={isSubmitting}>
                <ThemedText style={styles.deleteButtonText}>{isSubmitting ? 'Removing...' : 'Remove from Active'}</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent={true} visible={profileModalVisible} onRequestClose={closeProfileModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>Edit Profile</ThemedText>
            <ThemedText style={styles.profileModalText}>Update your profile and home location settings.</ThemedText>
            <TextInput style={styles.input} value={profileFirstName} onChangeText={setProfileFirstName} placeholder="First Name" />
            <TextInput style={styles.input} value={profileLastName} onChangeText={setProfileLastName} placeholder="Last Name" />
            <View style={styles.radiusInputContainer}>
              <TextInput 
                style={styles.radiusInput} 
                value={profileRadius} 
                onChangeText={setProfileRadius} 
                placeholder="5" 
                keyboardType="number-pad"
                maxLength={3}
              />
              <ThemedText style={styles.radiusLabel}>miles</ThemedText>
            </View>
            <TextInput
              style={[styles.input, styles.addressInput]}
              value={profileAddress}
              onChangeText={(text) => {
                setProfileAddress(text);
                setProfileAddressTouched(true);
                setProfileGeocodedAddress('');
                setProfileAddressError('');
                setAddressGuidanceText('');
                if (text.trim().length > 0) {
                  setProfileCoordinates(null);
                }
              }}
              onBlur={() => {
                void previewTypedAddress();
              }}
              placeholder="Home Address"
              multiline
              numberOfLines={3}
            />

            <ThemedText style={styles.profileDirectionsText}>Type a specific address: number, street, city, state/province, and postal code when available.</ThemedText>

            {isSearchingAddress && (
              <ThemedText style={styles.profileHintText}>Searching addresses...</ThemedText>
            )}

            {profileAddressSuggestions.length > 0 && (
              <View style={styles.suggestionsPanel}>
                {profileAddressSuggestions.map((suggestion) => (
                  <TouchableOpacity key={`${suggestion.displayName}-${suggestion.latitude}-${suggestion.longitude}`} style={styles.suggestionRow} onPress={() => selectAddressSuggestion(suggestion)}>
                    <ThemedText style={styles.suggestionText}>{suggestion.displayName}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {addressGuidanceText.length > 0 && (
              <ThemedText style={styles.addressGuidanceText}>{addressGuidanceText}</ThemedText>
            )}

            {isGeocodingAddress && (
              <ThemedText style={styles.profileHintText}>Looking up address...</ThemedText>
            )}

            {profileAddressError.length > 0 && (
              <ThemedText style={styles.addressErrorText}>{profileAddressError}</ThemedText>
            )}

            {/*
            <TouchableOpacity style={styles.locationButton} onPress={useCurrentLocation} disabled={isSavingProfile}>
              <ThemedText style={styles.locationButtonText}>Use My Location</ThemedText>
            </TouchableOpacity>
            */}

            {profileCoordinates && (
              <ThemedText style={styles.locationSummary}>
                Selected coordinates: {profileCoordinates.latitude.toFixed(6)}, {profileCoordinates.longitude.toFixed(6)}
              </ThemedText>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveButton} onPress={saveProfileChanges} disabled={isSavingProfile}>
                <ThemedText style={styles.saveButtonText}>{isSavingProfile ? 'Saving...' : 'Save'}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={closeProfileModal} disabled={isSavingProfile}>
                <ThemedText style={styles.cancelButtonText}>Dismiss</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ThemedText>Loading...</ThemedText>
        ) : (
          <>
            <View style={styles.profileCard}>
              <ThemedText style={styles.welcomeText}>Hello, {user?.firstName ?? 'Guest'}</ThemedText>
              <ThemedText style={styles.rangeText}>Your notification range is set to: {user?.radius ?? 'N/A'}</ThemedText>

              <View style={styles.mapPreview}>
                {user?.location && MAPTILER_KEY ? (
                  <MapTilerTileMap
                    center={{ latitude: user.location.latitude, longitude: user.location.longitude }}
                    radiusMiles={Number(user?.radius ?? user?.Radius ?? 5)}
                    apiKey={MAPTILER_KEY}
                    zoom={12}
                    styleId="streets-v4"
                    containerStyle={styles.mapPreviewTiles}
                  />
                ) : (
                  <ThemedText style={styles.mapText}>
                    {!MAPTILER_KEY ? 'Set EXPO_PUBLIC_MAPTILER_API_KEY to show your map.' : 'Set a saved location to show your area map.'}
                  </ThemedText>
                )}
              </View>

              {user?.location && (
                <ThemedText style={styles.locationSummary}>
                  Saved location: {user.location.latitude.toFixed(6)}, {user.location.longitude.toFixed(6)}
                </ThemedText>
              )}

              <TouchableOpacity style={styles.editButton} onPress={openProfileModal}>
                <ThemedText style={styles.editButtonText}>Edit</ThemedText>
              </TouchableOpacity>
            </View>

            {pets.map((pet: PetRecord) => (
              <View key={pet.id} style={styles.petCard}>
                {activeSearchesByPet[pet.docId || pet.id || ''] && (
                  <View style={styles.activeSearchBadge}>
                    <IconSymbol size={16} name="magnifyingglass" color="#ffffff" />
                  </View>
                )}

                <View style={styles.petCardHeader}>
                  <ThemedText style={styles.petName}>{pet.Name}</ThemedText>
                  {activeSearchesByPet[pet.docId || pet.id || '']?.Date || activeSearchesByPet[pet.docId || pet.id || '']?.date ? (
                    <ThemedText style={styles.activeSearchTime}>
                      {formatTimeSinceSearch(activeSearchesByPet[pet.docId || pet.id || '']?.Date ?? activeSearchesByPet[pet.docId || pet.id || '']?.date)}
                    </ThemedText>
                  ) : null}
                </View>

                <View style={styles.petCardRow}>
                  {pet.Image ? (
                    <Image
                      source={
                        pet.Image.startsWith('http')
                          ? { uri: pet.Image }
                          : petImageSources[pet.Image] || require('../../assets/pets/Default.jpg')
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
                    <ThemedText>Breed: {pet.Breed ?? 'Unknown'}</ThemedText>
                    <ThemedText>Color: {Array.isArray(pet.Color) ? pet.Color.join(', ') : pet.Color ?? 'Unknown'}</ThemedText>
                    <ThemedText>Size: {pet.Size ?? 'Unknown'}</ThemedText>
                  </View>
                </View>

                {!activeSearchesByPet[pet.docId || pet.id || ''] && (
                  <TouchableOpacity style={styles.createSearchButton} onPress={() => handleCreateSearch(pet)} disabled={creatingSearchPetId === (pet.docId || pet.id)}>
                    <ThemedText style={styles.createSearchButtonText}>{creatingSearchPetId === (pet.docId || pet.id) ? 'Creating...' : 'Create Search'}</ThemedText>
                  </TouchableOpacity>
                )}

                {activeSearchesByPet[pet.docId || pet.id || ''] && (
                  <TouchableOpacity style={styles.openSearchButton} onPress={() => openSearchDetails(activeSearchesByPet[pet.docId || pet.id || '']?.id)}>
                    <ThemedText style={styles.openSearchButtonText}>Open Search</ThemedText>
                  </TouchableOpacity>
                )}

                <View style={styles.petCardActions}>
                  <TouchableOpacity style={styles.editButtonSmall} onPress={() => openEditModal(pet)}>
                    <ThemedText style={styles.editButtonText}>Edit</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.addRemoveButton} onPress={openAddModal}>
              <ThemedText style={styles.addRemoveText}>Add Pet</ThemedText>
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
  profileSection: {
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  radiusText: {
    marginTop: 8,
    fontSize: 14,
  },
  petsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    marginTop: 8,
  },
  petName: {
    fontWeight: 'bold',
    fontSize: 22,
    color: '#2B3A4A',
    marginBottom: 4,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    marginBottom: 16,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  rangeText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  mapPreview: {
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbb',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E5F4FF',
    marginBottom: 10,
    overflow: 'hidden',
  },
  mapPreviewTiles: {
    width: '100%',
    height: '100%',
  },
  mapText: {
    color: '#1A3B5C',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  locationSummary: {
    fontSize: 13,
    color: '#37536B',
    marginBottom: 10,
    lineHeight: 18,
  },
  editButton: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    backgroundColor: '#00CC00',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 4,
  },
  editButtonSmall: {
    backgroundColor: '#00CC00',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  petCard: {
    padding: 14,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: '#BFCECF',
    borderWidth: 1,
    borderColor: '#7a8a8f',
    position: 'relative',
  },
  activeSearchBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0a5df0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  petCardHeader: {
    marginBottom: 8,
  },
  activeSearchTime: {
    fontSize: 12,
    color: '#0a5df0',
    fontWeight: '700',
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
  createSearchButton: {
    backgroundColor: '#1F4F8F',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 12,
  },
  createSearchButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  openSearchButton: {
    backgroundColor: '#0a5df0',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 10,
  },
  openSearchButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  petCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  addRemoveButton: {
    marginTop: 8,
    backgroundColor: '#7a7a7a',
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
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
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    height: 44,
  },
  dropdownSection: {
    marginBottom: 8,
  },
  dropdownLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2B3A4A',
    marginBottom: 4,
  },
  selectorInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  selectorInputText: {
    fontSize: 14,
    color: '#253748',
  },
  dropdownMenu: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#C9D3DE',
    borderRadius: 8,
    backgroundColor: '#F8FBFF',
    overflow: 'hidden',
  },
  dropdownMenuTall: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#C9D3DE',
    borderRadius: 8,
    backgroundColor: '#F8FBFF',
    maxHeight: 220,
    overflow: 'hidden',
  },
  dropdownOption: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAF2',
  },
  dropdownOptionSelected: {
    backgroundColor: '#E8F3FF',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#20384E',
  },
  selectionSummary: {
    marginTop: 6,
    fontSize: 12,
    color: '#4D6275',
    lineHeight: 17,
  },
  addressInput: {
    height: 88,
    textAlignVertical: 'top',
  },
  profileModalText: {
    fontSize: 14,
    color: '#6A6A6A',
    marginBottom: 10,
    lineHeight: 20,
  },
  profileDirectionsText: {
    fontSize: 12,
    color: '#51697F',
    marginTop: 2,
    marginBottom: 8,
    lineHeight: 18,
  },
  profileHintText: {
    fontSize: 13,
    color: '#37536B',
    marginTop: 6,
    marginBottom: 4,
  },
  suggestionsPanel: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: '#C9D3DE',
    borderRadius: 8,
    backgroundColor: '#F8FBFF',
    marginTop: 4,
    marginBottom: 6,
  },
  suggestionRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAF2',
  },
  suggestionText: {
    fontSize: 13,
    color: '#2D4357',
  },
  addressGuidanceText: {
    fontSize: 12,
    color: '#7A4B1D',
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 17,
  },
  addressErrorText: {
    fontSize: 13,
    color: '#9B1C1C',
    marginTop: 6,
    marginBottom: 4,
  },
  locationButton: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#3E7A56',
    alignItems: 'center',
  },
  locationButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  confirmPanel: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E1B1B1',
    backgroundColor: '#FFF3F3',
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    color: '#7A1414',
  },
  confirmBody: {
    fontSize: 14,
    marginBottom: 10,
    color: '#5E3333',
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  confirmCancelButton: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#999',
    marginRight: 5,
  },
  confirmCancelText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  confirmRemoveButton: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#b00020',
    marginLeft: 5,
  },
  confirmRemoveText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#0076C0',
    padding: 10,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
    marginRight: 5,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#999',
    padding: 10,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
    marginLeft: 5,
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  uploadButton: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0076C0',
    alignItems: 'center',
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 10,
    marginTop: 8,
    alignSelf: 'center',
  },
  deleteButton: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#d00',
    alignItems: 'center',
  },
  deleteButtonSmall: {
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#d00',
    alignItems: 'center',
    marginLeft: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  addRemoveText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  radiusInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  radiusInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    borderRadius: 8,
    height: 48,
    fontSize: 16,
    fontWeight: '500',
  },
  radiusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2B3A4A',
    minWidth: 45,
  },
});
