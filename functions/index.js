const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN || '';

function toMillis(value) {
  if (!value) {
    return 0;
  }

  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  if (typeof value.toDate === 'function') {
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

function toCoordinate(raw) {
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

function distanceMiles(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
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

function normalizeSightings(rawSightings) {
  const list = Array.isArray(rawSightings) ? rawSightings : [];
  return list
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const id = String(entry.id || '');
      const createdAtMs = toMillis(entry.createdAt || entry.CreatedAt);
      const location = entry.Location || entry.location;
      const coord = toCoordinate(location);
      if (!coord) {
        return null;
      }

      const syntheticId = id || `${entry.ReporterID || entry.reporterId || 'unknown'}-${createdAtMs}-${coord.latitude}-${coord.longitude}`;
      return {
        id: syntheticId,
        latitude: coord.latitude,
        longitude: coord.longitude,
        createdAtMs,
        details: String(entry.Details || entry.details || '').slice(0, 240),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function sendExpoPush(messages) {
  if (!messages.length) {
    return;
  }

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;
  }

  const batches = chunk(messages, 100);
  for (const batch of batches) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      const responseText = await response.text();
      logger.error('Expo push send failed', {
        status: response.status,
        body: responseText,
      });
    }
  }
}

async function getPetName(petId) {
  if (!petId) {
    return 'Pet';
  }

  try {
    const petDoc = await db.collection('pets').doc(String(petId)).get();
    if (!petDoc.exists) {
      return 'Pet';
    }

    const petData = petDoc.data() || {};
    return String(petData.Name || petData.name || 'Pet');
  } catch (error) {
    logger.warn('Unable to load pet name for notification', { petId, error: String(error) });
    return 'Pet';
  }
}

async function getNearbyNotificationMessages({ sighting, searchId, petName }) {
  const accountsSnapshot = await db.collection('accounts').get();
  const messages = [];

  for (const accountDoc of accountsSnapshot.docs) {
    const accountData = accountDoc.data() || {};
    const pushToken = String(accountData.pushToken || '').trim();
    if (!pushToken || !pushToken.startsWith('ExponentPushToken[')) {
      continue;
    }

    const location = toCoordinate(accountData.Location || accountData.location);
    if (!location) {
      continue;
    }

    const radiusMiles = Number(accountData.Radius || accountData.radius || 5);
    if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) {
      continue;
    }

    const milesAway = distanceMiles(location, {
      latitude: sighting.latitude,
      longitude: sighting.longitude,
    });

    if (milesAway > radiusMiles) {
      continue;
    }

    const roundedMiles = Math.max(0.1, Math.round(milesAway * 10) / 10);
    messages.push({
      to: pushToken,
      sound: 'default',
      title: `${petName} sighting nearby`,
      body: `A new sighting is about ${roundedMiles} miles from your home area.`,
      data: {
        searchId,
        sightingId: sighting.id,
      },
      priority: 'high',
    });
  }

  return messages;
}

function parseActiveSearcherIds(searchData) {
  const rawSearchers = Array.isArray(searchData?.Searchers)
    ? searchData.Searchers
    : Array.isArray(searchData?.searchers)
    ? searchData.searchers
    : [];

  const ids = new Set();

  for (const entry of rawSearchers) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }

      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          const searcherId = String(parsed.SearchersID || parsed.searcherId || parsed.SearcherID || parsed.id || '').trim();
          const status = Number(parsed.Status ?? parsed.status ?? 1);
          if (searcherId && status === 1) {
            ids.add(searcherId);
          }
        } catch {
          // Invalid JSON string entry; ignore.
        }
      } else {
        ids.add(trimmed);
      }
      continue;
    }

    if (entry && typeof entry === 'object') {
      const searcherId = String(entry.SearchersID || entry.searcherId || entry.SearcherID || entry.id || '').trim();
      const status = Number(entry.Status ?? entry.status ?? 1);
      if (searcherId && status === 1) {
        ids.add(searcherId);
      }
    }
  }

  return Array.from(ids);
}

async function getAccountPushToken(accountId) {
  if (!accountId) {
    return '';
  }

  try {
    const accountDoc = await db.collection('accounts').doc(String(accountId)).get();
    if (!accountDoc.exists) {
      return '';
    }

    const data = accountDoc.data() || {};
    const token = String(data.pushToken || '').trim();
    if (!token.startsWith('ExponentPushToken[')) {
      return '';
    }

    return token;
  } catch (error) {
    logger.warn('Unable to read account push token', { accountId, error: String(error) });
    return '';
  }
}

async function getSearchMessageNotificationMessages({ searchId, senderId, senderName, text }) {
  if (!searchId) {
    return [];
  }

  const searchDoc = await db.collection('searches').doc(String(searchId)).get();
  if (!searchDoc.exists) {
    return [];
  }

  const searchData = searchDoc.data() || {};
  const status = Number(searchData.Status ?? searchData.status ?? 0);
  if (status !== 1) {
    return [];
  }

  const ownerId = String(searchData.OwnerID || searchData.owner || '').trim();
  const recipientIds = new Set(parseActiveSearcherIds(searchData));
  if (ownerId) {
    recipientIds.add(ownerId);
  }

  if (senderId) {
    recipientIds.delete(senderId);
  }

  if (!recipientIds.size) {
    return [];
  }

  const preview = String(text || '').trim().slice(0, 180) || 'New message in your active search.';
  const safeSenderName = String(senderName || 'Search volunteer').trim() || 'Search volunteer';

  const messages = [];
  for (const recipientId of recipientIds) {
    const token = await getAccountPushToken(recipientId);
    if (!token) {
      continue;
    }

    messages.push({
      to: token,
      sound: 'default',
      title: `${safeSenderName} sent a message`,
      body: preview,
      data: {
        searchId,
        type: 'search-message',
      },
      priority: 'high',
    });
  }

  return messages;
}

exports.notifyNearbySightings = onDocumentUpdated('searches/{searchId}', async (event) => {
  const beforeData = event.data?.before?.data() || {};
  const afterData = event.data?.after?.data() || {};

  const beforeSightings = normalizeSightings(beforeData.Sightings || beforeData.sightings);
  const afterSightings = normalizeSightings(afterData.Sightings || afterData.sightings);

  if (!afterSightings.length) {
    return;
  }

  const existingIds = new Set(beforeSightings.map((s) => s.id));
  const newSightings = afterSightings.filter((s) => !existingIds.has(s.id));
  if (!newSightings.length) {
    return;
  }

  const searchId = String(event.params.searchId || '');
  const petId = afterData.PetID || afterData.petID;
  const petName = await getPetName(petId);

  for (const sighting of newSightings) {
    const messages = await getNearbyNotificationMessages({
      sighting,
      searchId,
      petName,
    });

    if (!messages.length) {
      continue;
    }

    await sendExpoPush(messages);
    logger.info('Sent nearby sighting notifications', {
      searchId,
      sightingId: sighting.id,
      recipients: messages.length,
    });
  }
});

exports.notifySearchMessageParticipants = onDocumentCreated('searchMessages/{messageId}', async (event) => {
  const messageData = event.data?.data() || {};
  const searchId = String(messageData.SearchID || '').trim();
  const senderId = String(messageData.SenderID || '').trim();
  const senderName = String(messageData.SenderName || '').trim();
  const text = String(messageData.Text || '').trim();

  const messages = await getSearchMessageNotificationMessages({
    searchId,
    senderId,
    senderName,
    text,
  });

  if (!messages.length) {
    return;
  }

  await sendExpoPush(messages);
  logger.info('Sent search message notifications', {
    searchId,
    messageId: String(event.params.messageId || ''),
    recipients: messages.length,
  });
});
