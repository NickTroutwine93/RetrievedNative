import { collection, query, where, getDocs, doc, updateDoc, getDoc, addDoc, GeoPoint, arrayUnion } from 'firebase/firestore';

function mapPetRecord(petDoc) {
  if (!petDoc?.exists()) {
    return null;
  }

  const petData = petDoc.data();
  return {
    id: petDoc.id,
    Name: petData.Name ?? petData.name ?? '',
    Breed: petData.Breed ?? petData.breed ?? '',
    Color: petData.Color ?? petData.color ?? [],
    Size: petData.Size ?? petData.size ?? '',
    Image: petData.Image ?? petData.image ?? null,
    ImageType: petData.ImageType ?? petData.imageType ?? '',
  };
}

async function hydrateSearchRecord(db, searchDoc) {
  const data = searchDoc.data();
  const petId = data.PetID ?? data.petID;
  const petDoc = petId ? await getDoc(doc(db, 'pets', petId)) : null;
  const rawSearchers = Array.isArray(data.Searchers)
    ? data.Searchers
    : Array.isArray(data.searchers)
    ? data.searchers
    : [];
  const searcherIds = [...new Set(rawSearchers.filter(Boolean))];

  const searcherNames = (
    await Promise.all(
      searcherIds.map(async (searcherId) => {
        const accountDoc = await getDoc(doc(db, 'accounts', searcherId));
        if (!accountDoc.exists()) {
          return null;
        }

        const account = accountDoc.data();
        const fullName = [account.FirstName, account.LastName].filter(Boolean).join(' ').trim();
        return fullName || account.Email || searcherId;
      })
    )
  ).filter(Boolean);

  return {
    id: searchDoc.id,
    ...data,
    date: data.Date ?? data.date,
    status: data.Status ?? data.status,
    owner: data.OwnerID ?? data.owner,
    petID: petId,
    searchers: searcherIds,
    searcherNames,
    created: data.created,
    lastUpdated: data.lastUpdated,
    pet: mapPetRecord(petDoc),
  };
}

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
    const userQuery = query(collection(db, 'accounts'), where('Email', '==', email));
    const userSnapshot = await getDocs(userQuery);
    
    if (userSnapshot.empty) {
      console.warn(`No user found for email: ${email}`);
      return [];
    }

    const userDoc = userSnapshot.docs[0];
    const userId = userDoc.id;

    const searchQuery = query(collection(db, 'searches'), where('OwnerID', '==', userId));
    const searchSnapshot = await getDocs(searchQuery);

    const activeSearchDocs = searchSnapshot.docs.filter((searchDoc) => {
      const data = searchDoc.data();
      const status = data.Status ?? data.status;
      return status === 1;
    });

    const searchDocs = await Promise.all(activeSearchDocs.map((searchDoc) => hydrateSearchRecord(db, searchDoc)));

    return searchDocs;
  } catch (error) {
    console.error('Error fetching user searches:', error);
    throw error;
  }
}

export async function getActiveSearches(db) {
  try {
    const searchSnapshot = await getDocs(collection(db, 'searches'));
    const activeSearchDocs = searchSnapshot.docs.filter((searchDoc) => {
      const data = searchDoc.data();
      const status = data.Status ?? data.status;
      return status === 1;
    });

    const searchDocs = await Promise.all(activeSearchDocs.map((searchDoc) => hydrateSearchRecord(db, searchDoc)));
    return searchDocs;
  } catch (error) {
    console.error('Error fetching active searches:', error);
    throw error;
  }
}

export async function createSearch(db, searchData) {
  try {
    if (!searchData?.petId) {
      throw new Error('PetID is required to create a search.');
    }

    if (!searchData?.ownerId) {
      throw new Error('OwnerID is required to create a search.');
    }

    const sourceLocation = searchData.location;
    if (!sourceLocation?.latitude || !sourceLocation?.longitude) {
      throw new Error('A valid user location is required to create a search.');
    }

    const existingSearches = await getDocs(
      query(
        collection(db, 'searches'),
        where('PetID', '==', searchData.petId),
        where('OwnerID', '==', searchData.ownerId)
      )
    );

    const hasActiveDuplicate = existingSearches.docs.some((existingDoc) => {
      const data = existingDoc.data();
      const status = data.Status ?? data.status;
      return status === 1;
    });

    if (hasActiveDuplicate) {
      throw new Error('An active search already exists for this pet.');
    }

    const searchLocation = new GeoPoint(sourceLocation.latitude, sourceLocation.longitude);
    const createdAt = new Date();
    const searchDoc = await addDoc(collection(db, 'searches'), {
      PetID: searchData.petId,
      OwnerID: searchData.ownerId,
      Location: searchLocation,
      Date: createdAt,
      Radius: Number(searchData.radius) || 5,
      Sightings: [],
      Searchers: [],
      Status: 1,
      Successfull: 0,
      Tipped: [],
    });

    await updateDoc(doc(db, 'accounts', searchData.ownerId), {
      YourSearches: arrayUnion(searchDoc.id),
    });

    return {
      id: searchDoc.id,
      PetID: searchData.petId,
      OwnerID: searchData.ownerId,
      Location: searchLocation,
      Date: createdAt,
      Radius: Number(searchData.radius) || 5,
      Sightings: [],
      Searchers: [],
      Status: 1,
      Successfull: 0,
      Tipped: [],
    };
  } catch (error) {
    console.error('Error creating search:', error);
    throw error;
  }
}

export async function joinSearch(db, searchId, email) {
  try {
    if (!searchId) {
      throw new Error('Search id is required to join a search.');
    }

    if (!email) {
      throw new Error('A signed-in user is required to join a search.');
    }

    const userQuery = query(collection(db, 'accounts'), where('Email', '==', email));
    const userSnapshot = await getDocs(userQuery);
    if (userSnapshot.empty) {
      throw new Error('User account not found for this session.');
    }

    const userId = userSnapshot.docs[0].id;
    await updateDoc(doc(db, 'searches', searchId), {
      Searchers: arrayUnion(userId),
    });

    return userId;
  } catch (error) {
    console.error('Error joining search:', error);
    throw error;
  }
}

export async function getSearchById(db, searchId) {
  try {
    const searchDoc = await getDoc(doc(db, 'searches', searchId));
    if (!searchDoc.exists()) {
      return null;
    }

    return hydrateSearchRecord(db, searchDoc);
  } catch (error) {
    console.error('Error fetching search by ID:', error);
    throw error;
  }
}

export async function endSearch(db, searchId, wasSuccessful) {
  try {
    const searchDoc = doc(db, 'searches', searchId);
    const successValue = wasSuccessful ? 1 : 0;

    await updateDoc(searchDoc, {
      Status: 0,
      status: 0,
      Successful: successValue,
      Successfull: successValue,
    });

    return true;
  } catch (error) {
    console.error('Error ending search:', error);
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
