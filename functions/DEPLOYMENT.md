# Cloud Function Deployment (Nearby Sighting Push)

This project now includes a Cloud Function trigger:
- `notifyNearbySightings` in `functions/index.js`
- Trigger: Firestore document update on `searches/{searchId}`
- Behavior: Detects newly added sightings and sends Expo push notifications to users whose profile `Location` is within their profile `Radius` miles of the sighting.

And a second trigger:
- `notifySearchMessageParticipants` in `functions/index.js`
- Trigger: Firestore document create on `searchMessages/{messageId}`
- Behavior: Sends a push notification to search owner + active searchers (excluding sender) with a message preview.

## 1) Prerequisites

- Firebase project connected to this codebase.
- Blaze billing plan enabled (required for Cloud Functions networking).
- Firebase CLI installed and logged in:
  - `npm i -g firebase-tools`
  - `firebase login`

## 2) Install Function Dependencies

From the repo root:

- `cd functions`
- `npm install`

## 3) (Optional) Set Expo Access Token Secret

The function can send notifications without an Expo access token, but setting one is recommended.

- `firebase functions:secrets:set EXPO_ACCESS_TOKEN`

Then redeploy functions.

## 4) Deploy

From repo root:

- `firebase deploy --only functions`

This uses `firebase.json` which points to the `functions` source directory.

## 5) Required App/Data Configuration

1. Accounts docs must contain:
   - `Location` as Firestore GeoPoint
   - `Radius` as number (miles)
   - `pushToken` as Expo push token string (`ExponentPushToken[...]`)
2. The mobile app already writes `pushToken` on sign-in from `src/services/notificationService.ts`.
3. Build and install native app (EAS/dev build) on a physical device and allow notifications.

## 6) Test Scenario

1. Sign in on two devices/accounts with valid home locations and radius.
2. Submit a new sighting in any active search.
3. Verify only accounts whose home radius includes the sighting receive notification.
4. Send a new chat message in an active search.
5. Verify owner/searchers (except sender) receive message push.

## Notes

- The function currently scans `accounts` collection and filters in code. This is acceptable for MVP; at larger scale, migrate to geohash indexing and server-side geo queries.
- Message/new-searcher push triggers can be added as separate Firestore triggers later.
