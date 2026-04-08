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
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

export const UserRole = Object.freeze({
  USER: 1,
  SHELTER: 2,
  ADMIN: 3,
});

function normalizeUserRole(rawRole) {
  const parsedRole = Number(rawRole);
  if (parsedRole === UserRole.SHELTER || parsedRole === UserRole.ADMIN) {
    return parsedRole;
  }

  return UserRole.USER;
}

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

function parseSearcherEntry(rawSearcher) {
  if (!rawSearcher) {
    return null;
  }

  if (typeof rawSearcher === 'string') {
    try {
      const parsed = JSON.parse(rawSearcher);
      return parseSearcherEntry(parsed);
    } catch {
      // Backward compatibility: historical data stored plain user IDs.
      return {
        searcherId: rawSearcher,
        status: 1,
      };
    }
  }

  if (typeof rawSearcher === 'object') {
    const searcherId =
      rawSearcher.SearcherID ??
      rawSearcher.searcherId ??
      rawSearcher.SearchersID ??
      rawSearcher.searchersID ??
      rawSearcher.id ??
      '';
    if (!searcherId) {
      return null;
    }

    const parsedStatus = Number(rawSearcher.Status ?? rawSearcher.status ?? 1);
    return {
      searcherId,
      status: parsedStatus === 0 ? 0 : 1,
    };
  }

  return null;
}

function normalizeSearcherEntries(rawSearchers) {
  const normalized = (Array.isArray(rawSearchers) ? rawSearchers : [])
    .map(parseSearcherEntry)
    .filter(Boolean);

  const uniqueById = new Map();
  normalized.forEach((entry) => {
    uniqueById.set(entry.searcherId, entry);
  });

  const entries = Array.from(uniqueById.values());
  const activeIds = entries.filter((entry) => entry.status === 1).map((entry) => entry.searcherId);
  return { entries, activeIds };
}

function stringifySearcherEntry(entry) {
  return JSON.stringify({
    SearchersID: entry.searcherId,
    Status: entry.status === 0 ? 0 : 1,
  });
}

function getPreferredFirstName(account, fallbackId = '') {
  const firstName = String(account?.FirstName || '').trim();
  if (firstName) {
    return firstName;
  }

  const email = String(account?.Email || '').trim();
  if (email.includes('@')) {
    return email.split('@')[0];
  }

  return email || fallbackId;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function offsetCoordinate(coordinate, distanceMiles, bearingDegrees) {
  const earthRadiusMiles = 3958.7613;
  const angularDistance = distanceMiles / earthRadiusMiles;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (coordinate.latitude * Math.PI) / 180;
  const lon1 = (coordinate.longitude * Math.PI) / 180;

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAd = Math.sin(angularDistance);
  const cosAd = Math.cos(angularDistance);

  const lat2 = Math.asin(sinLat1 * cosAd + cosLat1 * sinAd * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * sinAd * cosLat1, cosAd - sinLat1 * Math.sin(lat2));

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: ((lon2 * 180) / Math.PI + 540) % 360 - 180,
  };
}

function getObfuscatedCoordinate(coordinate, seed, minOffsetMiles = 0.35, maxOffsetMiles = 0.65) {
  const hash = hashString(seed || 'search-location');
  const bearing = hash % 360;
  const normalized = ((hash >> 8) % 1000) / 999;
  const distance = minOffsetMiles + (maxOffsetMiles - minOffsetMiles) * normalized;
  return offsetCoordinate(coordinate, distance, bearing);
}

function getRawLocation(data) {
  const location = data?.Location ?? data?.location;
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return null;
  }

  return {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

async function getOwnerExactLocation(db, searchId, ownerId, viewerUserId) {
  if (!searchId || !ownerId || !viewerUserId || ownerId !== viewerUserId) {
    return null;
  }

  const originDoc = await getDoc(doc(db, 'searchOrigins', searchId));
  if (!originDoc.exists()) {
    return null;
  }

  const originData = originDoc.data() || {};
  const originOwnerId = originData.OwnerID ?? originData.owner;
  const originLocation = originData.Location ?? originData.location;
  if (originOwnerId !== ownerId) {
    return null;
  }

  if (!originLocation || !Number.isFinite(originLocation.latitude) || !Number.isFinite(originLocation.longitude)) {
    return null;
  }

  return {
    latitude: originLocation.latitude,
    longitude: originLocation.longitude,
  };
}

function getSafeLocationForViewer({ rawLocation, ownerId, viewerUserId, searchId, storedIsObfuscated, ownerExactLocation }) {
  if (!rawLocation) {
    return { safeLocation: null, locationIsObfuscated: false };
  }

  const isOwnerViewer = Boolean(viewerUserId && ownerId && viewerUserId === ownerId);
  if (isOwnerViewer) {
    if (ownerExactLocation) {
      return {
        safeLocation: ownerExactLocation,
        locationIsObfuscated: false,
      };
    }

    return {
      safeLocation: rawLocation,
      locationIsObfuscated: Boolean(storedIsObfuscated),
    };
  }

  if (storedIsObfuscated) {
    return {
      safeLocation: rawLocation,
      locationIsObfuscated: true,
    };
  }

  return {
    safeLocation: getObfuscatedCoordinate(rawLocation, String(searchId || ownerId || 'search')),
    locationIsObfuscated: true,
  };
}

async function hydrateSearchRecord(db, searchDoc, viewerUserId = '') {
  const data = searchDoc.data();
  const petId = data.PetID ?? data.petID;
  const ownerId = data.OwnerID ?? data.owner;
  const storedIsObfuscated = Boolean(data.LocationIsObfuscated ?? data.locationIsObfuscated);
  const rawLocation = getRawLocation(data);
  const ownerExactLocation = await getOwnerExactLocation(db, searchDoc.id, ownerId, viewerUserId);
  const { safeLocation, locationIsObfuscated } = getSafeLocationForViewer({
    rawLocation,
    ownerId,
    viewerUserId,
    searchId: searchDoc.id,
    storedIsObfuscated,
    ownerExactLocation,
  });
  const petDoc = petId ? await getDoc(doc(db, 'pets', petId)) : null;
  const ownerDoc = ownerId ? await getDoc(doc(db, 'accounts', ownerId)) : null;
  const rawSearchers = Array.isArray(data.Searchers)
    ? data.Searchers
    : Array.isArray(data.searchers)
    ? data.searchers
    : [];
  const { entries: searcherEntries, activeIds: searcherIds } = normalizeSearcherEntries(rawSearchers);
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

        if (viewerUserId && searcherId === viewerUserId) {
          return 'You';
        }
        const account = accountDoc.data();
        return getPreferredFirstName(account, searcherId);
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
    Location: safeLocation,
    location: safeLocation,
    locationIsObfuscated,
    date: data.Date ?? data.date,
    status: data.Status ?? data.status,
    owner: ownerId,
    ownerName,
    petID: petId,
    searchers: searcherIds,
    searcherEntries,
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
      role: normalizeUserRole(doc.data().Role ?? doc.data().role),
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

export async function createUserAccount(db, email, profile) {
  try {
    const location = new GeoPoint(profile.location.latitude, profile.location.longitude);
    const role = normalizeUserRole(profile.role);

    const accountDoc = await addDoc(collection(db, 'accounts'), {
      AuthenticationAgent: 'Password',
      Email: email,
      FirstName: profile.firstName,
      LastName: profile.lastName,
      Role: role,
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
      Role: role,
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

    const searchDocs = await Promise.all(activeSearchDocs.map((searchDoc) => hydrateSearchRecord(db, searchDoc, userId)));

    return searchDocs;
  } catch (error) {
    console.error('Error fetching user searches:', error);
    throw error;
  }
}

export async function getActiveSearches(db, viewerUserId = '') {
  try {
    const searchSnapshot = await getDocs(collection(db, 'searches'));
    const activeSearchDocs = searchSnapshot.docs.filter((searchDoc) => {
      const data = searchDoc.data();
      const status = data.Status ?? data.status;
      return status === 1;
    });

    const searchDocs = await Promise.all(activeSearchDocs.map((searchDoc) => hydrateSearchRecord(db, searchDoc, viewerUserId)));
    return searchDocs;
  } catch (error) {
    console.error('Error fetching active searches:', error);
    throw error;
  }
}

export async function getUserSearchHistory(db, email) {
  try {
    const userQuery = query(collection(db, 'accounts'), where('Email', '==', email));
    const userSnapshot = await getDocs(userQuery);

    if (userSnapshot.empty) {
      console.warn(`No user found for email: ${email}`);
      return [];
    }

    const userId = userSnapshot.docs[0].id;
    const searchSnapshot = await getDocs(collection(db, 'searches'));
    const hydratedSearches = await Promise.all(searchSnapshot.docs.map((searchDoc) => hydrateSearchRecord(db, searchDoc, userId)));

    const history = hydratedSearches.filter((search) => {
      const status = search?.status ?? search?.Status;
      if (status === 1) {
        return false;
      }

      const ownerId = search?.owner ?? search?.OwnerID;
      const searcherIds = Array.isArray(search?.searchers)
        ? search.searchers
        : Array.isArray(search?.Searchers)
        ? search.Searchers
        : [];

      return ownerId === userId || searcherIds.includes(userId);
    });

    return history.sort((a, b) => {
      const aTime = toMillis(a?.Date ?? a?.date ?? a?.lastUpdated);
      const bTime = toMillis(b?.Date ?? b?.date ?? b?.lastUpdated);
      return bTime - aTime;
    });
  } catch (error) {
    console.error('Error fetching user search history:', error);
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
    senderId: messageData.SenderID,
    senderName: messageData.SenderName,
    text: messageData.Text,
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

    const activeSearches = await getActiveSearches(db, currentUser.id);
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
            activeSearchDocs.map((searchDoc) => hydrateSearchRecord(db, searchDoc, currentUser.id))
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

export async function getSearchMessages(db, searchId) {
  try {
    if (!searchId) {
      return [];
    }

    const messagesQuery = query(collection(db, 'searchMessages'), where('SearchID', '==', searchId));
    const snapshot = await getDocs(messagesQuery);
    return snapshot.docs
      .map(mapMessageRecord)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  } catch (error) {
    console.error('Error fetching search messages:', error);
    return [];
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

export function subscribeToSearch(db, searchId, viewerUserId, onSearch, onError) {
  const searchDocRef = doc(db, 'searches', searchId);
  return onSnapshot(
    searchDocRef,
    async (searchDoc) => {
      if (!searchDoc.exists()) {
        onSearch(null);
        return;
      }
      try {
        const hydrated = await hydrateSearchRecord(db, searchDoc, viewerUserId);
        onSearch(hydrated);
      } catch (err) {
        if (typeof onError === 'function') {
          onError(err);
        }
      }
    },
    (error) => {
      console.error('Error subscribing to search:', error);
      if (typeof onError === 'function') {
        onError(error);
      }
    }
  );
}

export function subscribeToActiveSearches(db, viewerUserId, onSearches, onError) {
  return onSnapshot(
    collection(db, 'searches'),
    async (snapshot) => {
      try {
        const activeDocs = snapshot.docs.filter((searchDoc) => {
          const data = searchDoc.data();
          const status = data.Status ?? data.status;
          return status === 1;
        });
        const hydrated = await Promise.all(
          activeDocs.map((searchDoc) => hydrateSearchRecord(db, searchDoc, viewerUserId))
        );
        onSearches(hydrated);
      } catch (err) {
        if (typeof onError === 'function') {
          onError(err);
        }
      }
    },
    (error) => {
      console.error('Error subscribing to active searches:', error);
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
    const rawSearchers = Array.isArray(searchData.Searchers)
      ? searchData.Searchers
      : Array.isArray(searchData.searchers)
      ? searchData.searchers
      : [];
    const { activeIds: searchers } = normalizeSearcherEntries(rawSearchers);

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

    const searchRef = doc(collection(db, 'searches'));
    const searchId = searchRef.id;
    const searchLocation = new GeoPoint(sourceLocation.latitude, sourceLocation.longitude);
    const publicLocation = getObfuscatedCoordinate(
      { latitude: sourceLocation.latitude, longitude: sourceLocation.longitude },
      String(searchId || searchData.ownerId || searchData.petId || 'search')
    );
    const publicGeoPoint = new GeoPoint(publicLocation.latitude, publicLocation.longitude);
    const createdAt = new Date();

    await setDoc(searchRef, {
      PetID: searchData.petId,
      OwnerID: searchData.ownerId,
      Location: publicGeoPoint,
      LocationIsObfuscated: true,
      Date: createdAt,
      Radius: Number(searchData.radius) || 5,
      Sightings: [],
      Searchers: [stringifySearcherEntry({ searcherId: searchData.ownerId, status: 1 })],
      Status: 1,
      Successfull: 0,
      Tipped: [],
       Info: searchData.info || '',
    });

    await setDoc(doc(db, 'searchOrigins', searchId), {
      SearchID: searchId,
      OwnerID: searchData.ownerId,
      Location: searchLocation,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'accounts', searchData.ownerId), {
      YourSearches: arrayUnion(searchId),
    });

    return {
      id: searchId,
      PetID: searchData.petId,
      OwnerID: searchData.ownerId,
      Location: publicGeoPoint,
      locationIsObfuscated: true,
      Date: createdAt,
      Radius: Number(searchData.radius) || 5,
      Sightings: [],
      Searchers: [stringifySearcherEntry({ searcherId: searchData.ownerId, status: 1 })],
      Status: 1,
      Successfull: 0,
      Tipped: [],
       Info: searchData.info || '',
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
    const searchRef = doc(db, 'searches', searchId);
    const searchSnapshot = await getDoc(searchRef);
    if (!searchSnapshot.exists()) {
      throw new Error('Search not found.');
    }

    const searchData = searchSnapshot.data() || {};
    const rawSearchers = Array.isArray(searchData.Searchers)
      ? searchData.Searchers
      : Array.isArray(searchData.searchers)
      ? searchData.searchers
      : [];

    const { entries } = normalizeSearcherEntries(rawSearchers);
    const existing = entries.find((entry) => entry.searcherId === userId);
    if (existing) {
      existing.status = 1;
    } else {
      entries.push({ searcherId: userId, status: 1 });
    }

    await updateDoc(searchRef, {
      Searchers: entries.map(stringifySearcherEntry),
      lastUpdated: serverTimestamp(),
    });

    return userId;
  } catch (error) {
    console.error('Error joining search:', error);
    throw error;
  }
}

export async function leaveSearch(db, searchId, email) {
  try {
    if (!searchId) {
      throw new Error('Search id is required to leave a search.');
    }

    if (!email) {
      throw new Error('A signed-in user is required to leave a search.');
    }

    const userQuery = query(collection(db, 'accounts'), where('Email', '==', email));
    const userSnapshot = await getDocs(userQuery);
    if (userSnapshot.empty) {
      throw new Error('User account not found for this session.');
    }

    const userId = userSnapshot.docs[0].id;
    const searchRef = doc(db, 'searches', searchId);
    const searchSnapshot = await getDoc(searchRef);
    if (!searchSnapshot.exists()) {
      throw new Error('Search not found.');
    }

    const searchData = searchSnapshot.data() || {};
    const rawSearchers = Array.isArray(searchData.Searchers)
      ? searchData.Searchers
      : Array.isArray(searchData.searchers)
      ? searchData.searchers
      : [];
    const { entries } = normalizeSearcherEntries(rawSearchers);
    const existing = entries.find((entry) => entry.searcherId === userId);

    if (!existing) {
      throw new Error('You are not currently joined to this search.');
    }

    existing.status = 0;

    await updateDoc(searchRef, {
      Searchers: entries.map(stringifySearcherEntry),
      lastUpdated: serverTimestamp(),
    });

    return userId;
  } catch (error) {
    console.error('Error leaving search:', error);
    throw error;
  }
}

export async function getSearchById(db, searchId, viewerUserId = '') {
  try {
    const searchDoc = await getDoc(doc(db, 'searches', searchId));
    if (!searchDoc.exists()) {
      return null;
    }

    return hydrateSearchRecord(db, searchDoc, viewerUserId);
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
    const rawSearchers = Array.isArray(searchData.Searchers)
      ? searchData.Searchers
      : Array.isArray(searchData.searchers)
      ? searchData.searchers
      : [];
    const { activeIds: searchers } = normalizeSearcherEntries(rawSearchers);

    const canSubmitSighting = reporterId === ownerId || searchers.includes(reporterId);
    if (!canSubmitSighting) {
      throw new Error('Only the pet owner or joined searchers can add sightings.');
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
