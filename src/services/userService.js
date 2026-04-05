import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  getDoc,
  addDoc,
  GeoPoint,
  Timestamp,
  arrayUnion,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

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

function mapSightingRecord(sighting, index = 0) {
  if (!sighting) {
    return null;
  }

  const location = sighting.Location ?? sighting.location;
  const latitude = location?.latitude;
  const longitude = location?.longitude;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    id: sighting.id || `sighting-${index}-${toMillis(sighting.createdAt ?? sighting.CreatedAt)}`,
    latitude,
    longitude,
    confidence: Number(sighting.Confidence ?? sighting.confidence ?? 0),
    details: sighting.Details ?? sighting.details ?? '',
    reporterId: sighting.ReporterID ?? sighting.reporterId ?? '',
    reporterName: sighting.ReporterName ?? sighting.reporterName ?? 'Searcher',
    createdAt: sighting.createdAt ?? sighting.CreatedAt ?? null,
    createdAtMs: toMillis(sighting.createdAt ?? sighting.CreatedAt),
  };
}

async function hydrateSearchRecord(db, searchDoc) {
  const data = searchDoc.data();
  const petId = data.PetID ?? data.petID;
  const ownerId = data.OwnerID ?? data.owner;
  const petDoc = petId ? await getDoc(doc(db, 'pets', petId)) : null;
  const ownerDoc = ownerId ? await getDoc(doc(db, 'accounts', ownerId)) : null;
  const rawSearchers = Array.isArray(data.Searchers)
    ? data.Searchers
    : Array.isArray(data.searchers)
    ? data.searchers
    : [];
  const searcherIds = [...new Set(rawSearchers.filter(Boolean))];
  const ownerData = ownerDoc?.exists() ? ownerDoc.data() : null;
  const ownerName = ownerData
    ? [ownerData.FirstName, ownerData.LastName].filter(Boolean).join(' ').trim() || ownerData.Email || ownerId
    : ownerId || '';

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

  const rawSightings = Array.isArray(data.Sightings)
    ? data.Sightings
    : Array.isArray(data.sightings)
    ? data.sightings
    : [];
  const sightings = rawSightings.map(mapSightingRecord).filter(Boolean).sort((a, b) => b.createdAtMs - a.createdAtMs);

  return {
    id: searchDoc.id,
    ...data,
    date: data.Date ?? data.date,
    status: data.Status ?? data.status,
    owner: ownerId,
    ownerName,
    petID: petId,
    searchers: searcherIds,
    searcherNames,
    sightings,
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

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapMessageRecord(messageDoc) {
  const messageData = messageDoc.data() || {};
  return {
    id: messageDoc.id,
    SearchID: messageData.SearchID,
    SenderID: messageData.SenderID,
    SenderName: messageData.SenderName,
    Text: messageData.Text,
    createdAt: messageData.createdAt,
    createdAtMs: toMillis(messageData.createdAt),
  };
}

export async function getUserMessageThreads(db, email) {
  try {
    if (!email) {
      return [];
    }

    const currentUser = await getUserData(db, email);
    if (!currentUser?.id) {
      return [];
    }

    const activeSearches = await getActiveSearches(db);
    const participantSearches = activeSearches.filter((search) => {
      const ownerId = search.owner ?? search.OwnerID;
      const searchers = Array.isArray(search.searchers)
        ? search.searchers
        : Array.isArray(search.Searchers)
        ? search.Searchers
        : [];

      return ownerId === currentUser.id || searchers.includes(currentUser.id);
    });

    const threadData = participantSearches.map((search) => mapThreadRecord(search, currentUser.id));

    return threadData.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  } catch (error) {
    console.error('Error loading message threads:', error);
    throw error;
  }
}

function mapThreadRecord(search, currentUserId) {
  const lastMessageAt = search.lastMessageAt ?? search.lastUpdated;
  const lastMessage = search.lastMessageText
    ? {
        id: `${search.id}-summary`,
        SearchID: search.id,
        SenderID: search.lastMessageSenderID,
        SenderName: search.lastMessageSenderName,
        Text: search.lastMessageText,
        createdAt: lastMessageAt,
        createdAtMs: toMillis(lastMessageAt),
      }
    : null;

  const messageReadAt = search.MessageReadAt || {};
  const userReadAtMs = toMillis(messageReadAt[currentUserId]);
  const lastMessageAtMs = lastMessage?.createdAtMs || 0;
  const unreadCount = lastMessageAtMs > userReadAtMs && lastMessage?.SenderID !== currentUserId ? 1 : 0;
  const lastUpdatedMs = toMillis(search.lastUpdated);
  const searchDateMs = toMillis(search.date ?? search.Date);

  return {
    id: search.id,
    searchId: search.id,
    pet: search.pet,
    ownerId: search.owner ?? search.OwnerID,
    ownerName: search.ownerName,
    searcherIds: search.searchers ?? search.Searchers ?? [],
    searcherNames: search.searcherNames ?? [],
    lastMessage,
    unreadCount,
    lastActivityMs: lastMessage?.createdAtMs || lastUpdatedMs || searchDateMs,
  };
}

export async function subscribeUserMessageThreads(db, email, onThreads, onError) {
  try {
    const currentUser = await getUserData(db, email);
    if (!currentUser?.id) {
      onThreads([], null);
      return () => {};
    }

    const searchRef = collection(db, 'searches');
    return onSnapshot(
      searchRef,
      async (snapshot) => {
        try {
          const activeSearchDocs = snapshot.docs.filter((searchDoc) => {
            const data = searchDoc.data();
            const status = data.Status ?? data.status;
            return status === 1;
          });

          const hydratedSearches = await Promise.all(
            activeSearchDocs.map((searchDoc) => hydrateSearchRecord(db, searchDoc))
          );

          const participantSearches = hydratedSearches.filter((search) => {
            const ownerId = search.owner ?? search.OwnerID;
            const searchers = Array.isArray(search.searchers)
              ? search.searchers
              : Array.isArray(search.Searchers)
              ? search.Searchers
              : [];

            return ownerId === currentUser.id || searchers.includes(currentUser.id);
          });

          const threadData = participantSearches
            .map((search) => mapThreadRecord(search, currentUser.id))
            .sort((a, b) => b.lastActivityMs - a.lastActivityMs);

          onThreads(threadData, currentUser.id);
        } catch (callbackError) {
          console.error('Error processing message thread subscription:', callbackError);
          if (typeof onError === 'function') {
            onError(callbackError);
          }
        }
      },
      (subscriptionError) => {
        console.error('Error subscribing to user message threads:', subscriptionError);
        if (typeof onError === 'function') {
          onError(subscriptionError);
        }
      }
    );
  } catch (error) {
    console.error('Error starting message thread subscription:', error);
    if (typeof onError === 'function') {
      onError(error);
    }
    return () => {};
  }
}

export function subscribeToSearchMessages(db, searchId, onMessages, onError) {
  const messagesQuery = query(collection(db, 'searchMessages'), where('SearchID', '==', searchId));

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs
        .map(mapMessageRecord)
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      onMessages(messages);
    },
    (error) => {
      console.error('Error subscribing to messages:', error);
      if (typeof onError === 'function') {
        onError(error);
      }
    }
  );
}

export async function sendSearchMessage(db, { searchId, senderId, senderName, text }) {
  try {
    const trimmedText = String(text || '').trim();
    if (!searchId) {
      throw new Error('Search id is required.');
    }

    if (!senderId) {
      throw new Error('Sender id is required.');
    }

    if (!trimmedText) {
      throw new Error('Message cannot be empty.');
    }

    const searchRef = doc(db, 'searches', searchId);
    const searchDoc = await getDoc(searchRef);
    if (!searchDoc.exists()) {
      throw new Error('Search not found.');
    }

    const searchData = searchDoc.data() || {};
    const status = searchData.Status ?? searchData.status;
    if (status !== 1) {
      throw new Error('Messaging is only available for active searches.');
    }

    const ownerId = searchData.OwnerID ?? searchData.owner;
    const searchers = Array.isArray(searchData.Searchers)
      ? searchData.Searchers
      : Array.isArray(searchData.searchers)
      ? searchData.searchers
      : [];

    if (senderId !== ownerId && !searchers.includes(senderId)) {
      throw new Error('You are not part of this search.');
    }

    const messageDoc = await addDoc(collection(db, 'searchMessages'), {
      SearchID: searchId,
      SenderID: senderId,
      SenderName: senderName || 'Search volunteer',
      Text: trimmedText,
      createdAt: serverTimestamp(),
    });

    await updateDoc(searchRef, {
      lastUpdated: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      lastMessageText: trimmedText.slice(0, 240),
      lastMessageSenderID: senderId,
      lastMessageSenderName: senderName || 'Search volunteer',
      [`MessageReadAt.${senderId}`]: serverTimestamp(),
    });

    return messageDoc.id;
  } catch (error) {
    console.error('Error sending search message:', error);
    throw error;
  }
}

export async function markSearchThreadRead(db, searchId, userId) {
  try {
    if (!searchId || !userId) {
      return;
    }

    await updateDoc(doc(db, 'searches', searchId), {
      [`MessageReadAt.${userId}`]: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error marking thread as read:', error);
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

export async function submitSearchSighting(db, { searchId, reporterId, reporterName, confidence, details, location }) {
  try {
    if (!searchId) {
      throw new Error('Search id is required.');
    }

    if (!reporterId) {
      throw new Error('Reporter id is required.');
    }

    const parsedConfidence = Number(confidence);
    if (!Number.isFinite(parsedConfidence) || parsedConfidence < 1 || parsedConfidence > 5) {
      throw new Error('Confidence must be between 1 and 5.');
    }

    if (!location?.latitude || !location?.longitude) {
      throw new Error('A valid sighting location is required.');
    }

    const searchRef = doc(db, 'searches', searchId);
    const searchSnapshot = await getDoc(searchRef);
    if (!searchSnapshot.exists()) {
      throw new Error('Search not found.');
    }

    const searchData = searchSnapshot.data() || {};
    const status = searchData.Status ?? searchData.status;
    if (status !== 1) {
      throw new Error('Sightings can only be added to active searches.');
    }

    const ownerId = searchData.OwnerID ?? searchData.owner;
    const searchers = Array.isArray(searchData.Searchers)
      ? searchData.Searchers
      : Array.isArray(searchData.searchers)
      ? searchData.searchers
      : [];

    if (reporterId === ownerId || !searchers.includes(reporterId)) {
      throw new Error('Only joined searchers can add sightings.');
    }

    const sightingRecord = {
      id: `${reporterId}-${Date.now()}`,
      ReporterID: reporterId,
      ReporterName: reporterName || 'Searcher',
      Confidence: parsedConfidence,
      Details: String(details || '').trim(),
      Location: new GeoPoint(location.latitude, location.longitude),
      createdAt: Timestamp.now(),
    };

    await updateDoc(searchRef, {
      Sightings: arrayUnion(sightingRecord),
      lastUpdated: serverTimestamp(),
    });

    return mapSightingRecord(sightingRecord);
  } catch (error) {
    console.error('Error submitting search sighting:', error);
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
