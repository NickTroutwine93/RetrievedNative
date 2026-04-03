import { collection, query, where, getDocs, doc, updateDoc, getDoc, addDoc, GeoPoint } from 'firebase/firestore';

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
      ...doc.data(),
      id: doc.id,
      firstName: doc.data().FirstName,
      radius: doc.data().Radius,
      location: doc.data().Location,
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

export async function createUserAccount(db, email, profile) {
  try {
    const location = new GeoPoint(profile.location.latitude, profile.location.longitude);

    const accountDoc = await addDoc(collection(db, 'accounts'), {
      AuthenticationAgent: 'Password',
      Email: email,
      FirstName: profile.firstName,
      LastName: profile.lastName,
      Radius: Number(profile.radius) || 5,
      Location: location,
      PetID: [],
      ActiveSearches: [],
      SearchHistory: [],
      YourSearches: [],
    });

    return {
      id: accountDoc.id,
      Email: email,
      FirstName: profile.firstName,
      LastName: profile.lastName,
      Radius: Number(profile.radius) || 5,
      Location: location,
    };
  } catch (error) {
    console.error('Error creating user account:', error);
    throw error;
  }
}

export async function updateUserLocation(db, userId, location) {
  try {
    const accountDoc = doc(db, 'accounts', userId);
    const geoPoint = new GeoPoint(location.latitude, location.longitude);

    await updateDoc(accountDoc, {
      Location: geoPoint,
    });

    return geoPoint;
  } catch (error) {
    console.error('Error updating user location:', error);
    throw error;
  }
}

export async function updateUserProfile(db, userId, profile) {
  try {
    const accountDoc = doc(db, 'accounts', userId);
    const updates = {};

    if (profile.firstName !== undefined) {
      updates.FirstName = profile.firstName;
    }

    if (profile.lastName !== undefined) {
      updates.LastName = profile.lastName;
    }

    if (profile.radius !== undefined) {
      updates.Radius = Number(profile.radius) || 5;
    }

    if (profile.location) {
      updates.Location = new GeoPoint(profile.location.latitude, profile.location.longitude);
    }

    await updateDoc(accountDoc, updates);

    return {
      firstName: updates.FirstName,
      lastName: updates.LastName,
      radius: updates.Radius,
      location: updates.Location,
    };
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

export async function getUserPets(db, ownerId) {
  try {
    const q = query(collection(db, 'pets'), where('OwnerID', '==', ownerId));
    const snapshot = await getDocs(q);
    
    // Filter to only active pets and support both Status/status field names.
    const activePets = snapshot.docs.filter((doc) => {
      const data = doc.data();
      const status = data.Status ?? data.status;
      return status === undefined || status === 1;
    });
    
    return activePets.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        docId: doc.id,
        OwnerID: data.OwnerID,
        Name: data.Name ?? data.name ?? '',
        Type: data.Type ?? data.type ?? '',
        Breed: data.Breed ?? data.breed ?? '',
        Color: data.Color ?? data.color ?? [],
        Age: data.Age ?? data.age,
        Size: data.Size ?? data.size ?? '',
        Image: data.Image ?? data.image ?? null,
        ImageType: data.ImageType ?? data.imageType ?? '',
        Status: data.Status ?? data.status ?? 1,
      };
    });
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

    const before = await getDoc(petDoc);
    if (!before.exists()) {
      throw new Error(`Pet document not found for id: ${petId}`);
    }

    await updateDoc(petDoc, { Status: 0, status: 0 });

    // Confirm write so caller can surface a meaningful error if rules block updates.
    const updated = await getDoc(petDoc);
    const data = updated.data() || {};
    if (!updated.exists() || (data.Status !== 0 && data.status !== 0)) {
      throw new Error(`Deactivate verification failed for ${petId}. Current values => Status: ${String(data.Status)}, status: ${String(data.status)}`);
    }

    return true;
  } catch (error) {
    console.error('Error deactivating pet:', error);
    const code = error?.code ? ` [${error.code}]` : '';
    const message = error?.message || 'Unknown deactivate error';
    throw new Error(`Failed to set Status to 0 for pet ${petId}${code}: ${message}`);
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
      Status: 1,
      status: 1,
    });

    return {
      id: petDoc.id,
      OwnerID: ownerId,
      ...petData,
      Status: 1,
      status: 1,
    };
  } catch (error) {
    console.error('Error adding pet:', error);
    throw error;
  }
}
