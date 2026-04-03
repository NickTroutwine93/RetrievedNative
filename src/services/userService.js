import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';

export async function getUserData(db, email) {
  try {
    const q = query(collection(db, 'accounts'), where('Email', '==', email));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.warn(`No account found for email: ${email}`);
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      firstName: doc.data().FirstName,
      radius: doc.data().Radius,
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

export async function getUserPets(db, ownerId) {
  try {
    const q = query(collection(db, 'pets'), where('OwnerID', '==', ownerId));
    const snapshot = await getDocs(q);
    
    // Filter to only active pets (Status == 1 or undefined for existing pets)
    const activePets = snapshot.docs.filter((doc) => {
      const status = doc.data().Status;
      return status === undefined || status === 1;
    });
    
    return activePets.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      name: doc.data().Name || doc.data().name,
      type: doc.data().Type || doc.data().type,
      breed: doc.data().Breed || doc.data().breed,
      color: doc.data().Color || doc.data().color,
      age: doc.data().Age || doc.data().age,
      size: doc.data().Size || doc.data().size,
      image: doc.data().Image || doc.data().image || null,
      status: doc.data().Status || 1, // Default to active for existing pets
    }));
  } catch (error) {
    console.error('Error fetching user pets:', error);
    throw error;
  }
}

export async function getUserSearches(db, email) {
  try {
    // First, get the user to find their ID
    const userQuery = query(collection(db, 'accounts'), where('Email', '==', email));
    const userSnapshot = await getDocs(userQuery);
    
    if (userSnapshot.empty) {
      console.warn(`No user found for email: ${email}`);
      return [];
    }

    const userId = userSnapshot.docs[0].id;

    // Then get searches where user is in searchersID array
    const searchQuery = query(
      collection(db, 'searches'),
      where('searchersID', 'array-contains', userId)
    );
    const searchSnapshot = await getDocs(searchQuery);

    return searchSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      status: doc.data().status,
      owner: doc.data().owner,
      petID: doc.data().petID,
      created: doc.data().created,
      lastUpdated: doc.data().lastUpdated,
    }));
  } catch (error) {
    console.error('Error fetching user searches:', error);
    throw error;
  }
}

export async function getSearchById(db, searchId) {
  try {
    const q = query(collection(db, 'searches'), where('__name__', '==', searchId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    return {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data(),
    };
  } catch (error) {
    console.error('Error fetching search by ID:', error);
    throw error;
  }
}

export async function updatePet(db, petId, updates) {  try {
    const petDoc = doc(db, 'pets', petId);
    await updateDoc(petDoc, updates);
    return true;
  } catch (error) {
    console.error('Error updating pet:', error);
    throw error;
  }
}

export async function deactivatePet(db, petId) {
  try {
    const petDoc = doc(db, 'pets', petId);
    await updateDoc(petDoc, { Status: 0 });
    return true;
  } catch (error) {
    console.error('Error deactivating pet:', error);
    throw error;
  }
}

export async function addPet(db, ownerId, petData) {
  try {
    const petDoc = await addDoc(collection(db, 'pets'), {
      OwnerID: ownerId,
      Name: petData.Name,
      Breed: petData.Breed,
      Color: petData.Color,
      Size: petData.Size,
      Image: petData.Image,
      ImageType: petData.ImageType || '',
      Status: 1, // Active by default
    });

    return {
      id: petDoc.id,
      OwnerID: ownerId,
      ...petData,
      Status: 1,
    };
  } catch (error) {
    console.error('Error adding pet:', error);
    throw error;
  }
}
