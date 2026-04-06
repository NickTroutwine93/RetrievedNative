/*
  One-time migration for legacy search origin coordinates.

  What it does:
  1) Copies exact Location from searches/{id} into searchOrigins/{id}
  2) Replaces searches/{id}.Location with deterministic obfuscated coordinates
  3) Sets searches/{id}.LocationIsObfuscated = true

  Usage:
  1) npm install firebase-admin
  2) set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path
  3) node scripts/migrate-search-origins-admin.js --project=<firebase-project-id> [--dry-run]
*/

/* eslint-disable no-console */
const admin = require('firebase-admin');

function parseArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

function hasFlag(flag) {
  return process.argv.includes(`--${flag}`);
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

async function run() {
  const projectId = parseArg('project');
  const dryRun = hasFlag('dry-run');

  if (!projectId) {
    throw new Error('Missing --project=<firebase-project-id>');
  }

  admin.initializeApp({ projectId });
  const db = admin.firestore();

  const snapshot = await db.collection('searches').get();
  let scanned = 0;
  let migrated = 0;
  let skipped = 0;

  for (const searchDoc of snapshot.docs) {
    scanned += 1;
    const data = searchDoc.data() || {};
    const ownerId = data.OwnerID || data.owner;
    const location = data.Location || data.location;
    const isObfuscated = Boolean(data.LocationIsObfuscated || data.locationIsObfuscated);

    if (!ownerId || !location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      skipped += 1;
      continue;
    }

    if (isObfuscated) {
      skipped += 1;
      continue;
    }

    const exact = { latitude: location.latitude, longitude: location.longitude };
    const obfuscated = getObfuscatedCoordinate(exact, String(searchDoc.id || ownerId || 'search'));
    const originRef = db.collection('searchOrigins').doc(searchDoc.id);
    const searchRef = db.collection('searches').doc(searchDoc.id);

    if (dryRun) {
      migrated += 1;
      continue;
    }

    await originRef.set(
      {
        SearchID: searchDoc.id,
        OwnerID: ownerId,
        Location: new admin.firestore.GeoPoint(exact.latitude, exact.longitude),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await searchRef.update({
      Location: new admin.firestore.GeoPoint(obfuscated.latitude, obfuscated.longitude),
      LocationIsObfuscated: true,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });

    migrated += 1;
  }

  console.log(JSON.stringify({ scanned, migrated, skipped, dryRun }, null, 2));
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
