import React, { useEffect, useState } from 'react';
import { StyleSheet, ScrollView, View, Image, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { auth, db } from '../../src/services/firebaseClient';
import { getUserData, getUserPets, updatePet, addPet, deactivatePet } from '../../src/services/userService';

const petImageSources: Record<string, any> = {
  'Rigby.jpg': require('../../assets/pets/Rigby.jpg'),
  'Taz.jpg': require('../../assets/pets/Taz.jpg'),
};

export default function HomeScreen() {
  const [user, setUser] = useState<any>(null);
  const [pets, setPets] = useState<any>([]);
  const [loading, setLoading] = useState(true);
  const [editingPet, setEditingPet] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBreed, setEditBreed] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editImageType, setEditImageType] = useState('');
  const [editImageUri, setEditImageUri] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  type PetRecord = {
    id?: string;
    docId?: string;
    Name?: string;
    Breed?: string;
    Color?: string[] | string;
    Size?: string;
    Image?: string;
    ImageType?: string;
    Status?: number;
  };

  useEffect(() => {
    async function loadUserData() {
      try {
        const signedInEmail = auth.currentUser?.email;
        if (!signedInEmail) {
          setLoading(false);
          return;
        }

        const account = await getUserData(db, signedInEmail);
        console.log('user account', account);
        setUser(account);

        if (account?.id) {
          const petsData = await getUserPets(db, account.id);
          console.log('pets data for ownerId', account.id, petsData);
          setPets(petsData);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadUserData();
  }, []);

  const openEditModal = (pet: PetRecord) => {
    setIsAddMode(false);
    setEditingPet(pet);
    setShowRemoveConfirm(false);
    setEditName(pet.Name ?? '');
    setEditBreed(pet.Breed ?? '');
    setEditColor(Array.isArray(pet.Color) ? pet.Color.join(', ') : pet.Color ?? '');
    setEditSize(pet.Size ?? '');
    setEditImage(pet.Image ?? '');
    setEditImageType(pet.ImageType ?? '');
    setEditImageUri('');
    setModalVisible(true);
  };

  const openAddModal = () => {
    setIsAddMode(true);
    setEditingPet(null);
    setShowRemoveConfirm(false);
    setEditName('');
    setEditBreed('');
    setEditColor('');
    setEditSize('');
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
    const colorString = editColor || '';
    const colorArray = colorString
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.appHeader}>
        <ThemedText style={styles.logoText}>Retrieved</ThemedText>
        <View style={styles.avatarCircle}>
          <ThemedText style={styles.avatarText}>{(user?.firstName?.[0] ?? 'U').toUpperCase()}</ThemedText>
        </View>
      </View>

      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={closeEditModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>{isAddMode ? 'Add Pet' : 'Edit Pet'}</ThemedText>
            <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Name" />
            <TextInput style={styles.input} value={editBreed} onChangeText={setEditBreed} placeholder="Breed" />
            <TextInput style={styles.input} value={editColor} onChangeText={setEditColor} placeholder="Color (comma-separated)" />
            <TextInput style={styles.input} value={editSize} onChangeText={setEditSize} placeholder="Size" />
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

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ThemedText>Loading...</ThemedText>
        ) : (
          <>
            <View style={styles.profileCard}>
              <ThemedText style={styles.welcomeText}>Hello, {user?.firstName ?? 'Guest'}</ThemedText>
              <ThemedText style={styles.rangeText}>Your notification range is set to: {user?.radius ?? 'N/A'}</ThemedText>

              <View style={styles.mapPreview}>
                <ThemedText style={styles.mapText}>Map preview (placeholder)</ThemedText>
              </View>

              <TouchableOpacity style={styles.editButton} onPress={() => {}}>
                <ThemedText style={styles.editButtonText}>Edit</ThemedText>
              </TouchableOpacity>
            </View>

            {pets.map((pet: PetRecord) => (
              <View key={pet.id} style={styles.petCard}>
                <View style={styles.petCardHeader}>
                  <ThemedText style={styles.petName}>{pet.Name}</ThemedText>
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

                <TouchableOpacity style={styles.createSearchButton} onPress={() => {}}>
                  <ThemedText style={styles.createSearchButtonText}>Create Search</ThemedText>
                </TouchableOpacity>

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
  appHeader: {
    height: 70,
    backgroundColor: '#0076C0',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    backgroundColor: '#003E7A',
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
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
  },
  mapText: {
    color: '#1A3B5C',
    fontSize: 12,
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
  },
  petCardHeader: {
    marginBottom: 8,
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
});
