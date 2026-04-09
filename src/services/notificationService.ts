import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { db } from './firebaseClient';
import { addNotificationCenterItem } from './notificationCenter';
import { getUserData, subscribeToActiveSearches } from './userService';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type StopWatching = () => void;

let stopWatcher: StopWatching | null = null;
let watchingEmail = '';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function toMillis(value: any): number {
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

function normalizeCoordinate(raw: any): Coordinate | null {
  if (!raw) {
    return null;
  }

  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function milesBetween(a: Coordinate, b: Coordinate): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;

  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMiles * arc;
}

async function registerForPushTokenAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device.');
    return null;
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let status = existingPermission.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    console.warn('Push notification permission was not granted.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1f6feb',
    });
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId
    || Constants?.easConfig?.projectId;

  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  return tokenResponse?.data || null;
}

async function savePushTokenForUser(email: string, pushToken: string | null): Promise<void> {
  if (!email || !pushToken) {
    return;
  }

  const account = await getUserData(db, email);
  if (!account?.id) {
    return;
  }

  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'accounts', account.id), {
    pushToken,
  });
}

async function notifyNearbySighting(params: {
  petName: string;
  searchId: string;
  milesAway: number;
  sightingId: string;
}): Promise<void> {
  const roundedMiles = Math.max(0.1, Math.round(params.milesAway * 10) / 10);
  const title = `${params.petName} sighting nearby`;
  const body = `A new sighting is about ${roundedMiles} miles from your home radius.`;
  addNotificationCenterItem({
    type: 'nearby-sighting',
    title,
    body,
    searchId: params.searchId,
    sightingId: params.sightingId,
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        searchId: params.searchId,
        sightingId: params.sightingId,
        type: 'nearby-sighting',
      },
    },
    trigger: null,
  });
}

async function notifyNearbySearch(params: {
  petName: string;
  searchId: string;
  milesAway: number;
}): Promise<void> {
  const roundedMiles = Math.max(0.1, Math.round(params.milesAway * 10) / 10);
  const title = `New nearby search: ${params.petName}`;
  const body = `A new search started about ${roundedMiles} miles from your home area.`;
  addNotificationCenterItem({
    type: 'nearby-search',
    title,
    body,
    searchId: params.searchId,
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        searchId: params.searchId,
        type: 'nearby-search',
      },
    },
    trigger: null,
  });
}

async function notifyParticipantMessage(params: {
  petName: string;
  searchId: string;
  senderName: string;
}): Promise<void> {
  const title = `${params.senderName} sent a message`;
  const body = `New update for ${params.petName}.`;
  addNotificationCenterItem({
    type: 'search-message',
    title,
    body,
    searchId: params.searchId,
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        searchId: params.searchId,
        type: 'search-message',
      },
    },
    trigger: null,
  });
}

async function notifyParticipantSighting(params: {
  petName: string;
  searchId: string;
  sightingId: string;
}): Promise<void> {
  const title = `New sighting update: ${params.petName}`;
  const body = 'A new sighting was added to a search you are involved in.';
  addNotificationCenterItem({
    type: 'search-sighting',
    title,
    body,
    searchId: params.searchId,
    sightingId: params.sightingId,
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        searchId: params.searchId,
        sightingId: params.sightingId,
        type: 'search-sighting',
      },
    },
    trigger: null,
  });
}

function getParticipantState(search: any, currentUserId: string) {
  const ownerId = String(search?.owner ?? search?.OwnerID ?? '');
  const searcherIds = Array.isArray(search?.searchers)
    ? search.searchers
    : Array.isArray(search?.Searchers)
    ? search.Searchers
    : [];

  return {
    ownerId,
    isParticipant: ownerId === currentUserId || searcherIds.includes(currentUserId),
  };
}

function getLatestSighting(search: any) {
  const sightings = Array.isArray(search?.sightings) ? search.sightings : [];
  let latest: any = null;
  let latestMs = 0;

  for (const sighting of sightings) {
    const sightingMs = toMillis(sighting?.createdAtMs ?? sighting?.createdAt);
    if (sightingMs > latestMs) {
      latestMs = sightingMs;
      latest = sighting;
    }
  }

  return { latest, latestMs };
}

export async function startInAppNotifications(email: string): Promise<StopWatching> {
  if (!email) {
    return () => {};
  }

  if (stopWatcher && watchingEmail === email) {
    return stopWatcher;
  }

  stopInAppNotifications();

  const account = await getUserData(db, email);
  const home = normalizeCoordinate(account?.location ?? account?.Location);
  const radiusMiles = Number(account?.radius ?? account?.Radius ?? 5);

  if (!account?.id || !home || !Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    return () => {};
  }

  try {
    const pushToken = await registerForPushTokenAsync();
    await savePushTokenForUser(email, pushToken);
  } catch (registrationError) {
    console.warn('Unable to complete push token registration:', registrationError);
  }

  const knownSearchIds = new Set<string>();
  const latestSightingMsBySearchId = new Map<string, number>();
  const latestMessageMsBySearchId = new Map<string, number>();
  let hasPrimedSnapshot = false;

  const unsubscribe = subscribeToActiveSearches(
    db,
    account.id,
    async (searches: any[]) => {
      for (const search of searches || []) {
        const searchId = String(search?.id || '');
        if (!searchId) {
          continue;
        }

        const petName = String(search?.pet?.Name || 'Pet');
        const isKnownSearch = knownSearchIds.has(searchId);
        const searchCoord = normalizeCoordinate(search?.location ?? search?.Location);

        if (hasPrimedSnapshot && !isKnownSearch && searchCoord) {
          const distanceMiles = milesBetween(home, searchCoord);
          const ownerId = String(search?.owner ?? search?.OwnerID ?? '');
          const isOwnSearch = ownerId === account.id;
          if (!isOwnSearch && distanceMiles <= radiusMiles) {
            await notifyNearbySearch({
              petName,
              searchId,
              milesAway: distanceMiles,
            });
          }
        }

        const { isParticipant } = getParticipantState(search, account.id);
        const previousLatestSightingMs = latestSightingMsBySearchId.get(searchId) ?? 0;
        const { latest: latestSighting, latestMs: latestSightingMs } = getLatestSighting(search);

        if (
          hasPrimedSnapshot
          && isParticipant
          && latestSighting
          && latestSightingMs > previousLatestSightingMs
          && String(latestSighting?.reporterId || '') !== account.id
        ) {
          await notifyParticipantSighting({
            petName,
            searchId,
            sightingId: String(latestSighting?.id || `${searchId}-${latestSightingMs}`),
          });

          const sightingCoord = normalizeCoordinate({
            latitude: latestSighting?.latitude,
            longitude: latestSighting?.longitude,
          });
          if (sightingCoord) {
            const distanceMiles = milesBetween(home, sightingCoord);
            if (distanceMiles <= radiusMiles) {
              await notifyNearbySighting({
                petName,
                searchId,
                milesAway: distanceMiles,
                sightingId: String(latestSighting?.id || `${searchId}-${latestSightingMs}`),
              });
            }
          }
        }

        const previousLatestMessageMs = latestMessageMsBySearchId.get(searchId) ?? 0;
        const latestMessageMs = toMillis(search?.lastMessageAt);
        const lastMessageSenderId = String(search?.lastMessageSenderID || '');
        const lastMessageSenderName = String(search?.lastMessageSenderName || 'Search volunteer');

        if (
          hasPrimedSnapshot
          && isParticipant
          && latestMessageMs > previousLatestMessageMs
          && lastMessageSenderId
          && lastMessageSenderId !== account.id
        ) {
          await notifyParticipantMessage({
            petName,
            searchId,
            senderName: lastMessageSenderName,
          });
        }

        knownSearchIds.add(searchId);
        latestSightingMsBySearchId.set(searchId, latestSightingMs);
        latestMessageMsBySearchId.set(searchId, latestMessageMs);
      }

      if (!hasPrimedSnapshot) {
        hasPrimedSnapshot = true;
      }
    },
    (error: any) => {
      console.error('Home-radius sighting subscription failed:', error);
    }
  );

  const stop: StopWatching = () => {
    try {
      unsubscribe?.();
    } catch {
      // no-op
    }

    if (stopWatcher === stop) {
      stopWatcher = null;
      watchingEmail = '';
    }
  };

  stopWatcher = stop;
  watchingEmail = email;
  return stop;
}

export function stopInAppNotifications() {
  if (stopWatcher) {
    stopWatcher();
  }
}

// Backward compatibility for previous startup wiring.
export async function startHomeRadiusSightingNotifications(email: string): Promise<StopWatching> {
  return startInAppNotifications(email);
}

export function stopHomeRadiusSightingNotifications() {
  stopInAppNotifications();
}
