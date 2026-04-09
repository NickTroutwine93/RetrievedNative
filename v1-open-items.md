# V1 Open Items

These three items are required before the app can ship to real users.
Track progress here and delete the file once all three are closed.

---

## 1. Push Notifications

**Why it matters:** Without notifications, message and sighting activity is invisible
to users who are not actively in the app. Coordination breaks down.

**Steps:**
- [ ] Install `expo-notifications` and `expo-device`
      `npx expo install expo-notifications expo-device`
- [ ] Create `src/services/notificationService.ts`
      — register for push token on sign-in
      — store token on user's `accounts` document (`pushToken` field)
      — request permission with a user-facing explanation
- [ ] Add Firestore rule allowing the account owner to write their own `pushToken`
- [ ] Trigger notifications via Firebase Cloud Messaging (FCM) or a Cloud Function:
      — new message in a search the user participates in (`sendSearchMessage`)
      — new searcher joined a search the user owns (`joinSearch`)
- [ ] Handle foreground / background / killed-app receiving in `app/_layout.tsx`
- [ ] Test on a physical device (push tokens do not work in simulators)

**Notes:**
- Expo Go supports test push tokens; standalone builds require FCM credentials in `app.json`
- Web (GitHub Pages) can use the Web Push API via `expo-notifications` on supported browsers

---

## 2. Verify Firestore Rules Deployment

**Why it matters:** `searchMessages` (member-only write) and `searchOrigins` (owner-only
exact location) rules live in `firestore.location-privacy.rules`, not `firestore.rules`.
If only `firestore.rules` was deployed, those collections are either open or blocked.

**Steps:**
- [ ] Open Firebase Console → Firestore → Rules
- [ ] Confirm the live rules include:
      — `match /searchMessages/{msgId}` with sender-is-participant check
      — `match /searchOrigins/{searchId}` with owner-only read/write
- [ ] If missing, merge `firestore.location-privacy.rules` into `firestore.rules`
      and re-deploy: `firebase deploy --only firestore:rules`
- [ ] Run the Firebase Rules Simulator against these scenarios:
      — Non-participant cannot write to `searchMessages`
      — Non-owner cannot read from `searchOrigins`
      — Owner can read their own `searchOrigins` document

---

## 3. Pet Image Upload to Firebase Storage

**Why it matters:** Every new user's pet defaults to `Default.jpg`; there is no path
to upload a real photo. `expo-image-picker` is already installed.

**Steps:**
- [ ] Enable Firebase Storage in the Firebase Console and set bucket rules
      (authenticated read, owner-only write keyed by `ownerId` path segment)
- [ ] Install Storage SDK if not already present:
      `npx expo install firebase` (Storage is included in the firebase package)
- [ ] Add `getStorage` initialisation to `src/services/firebaseClient.ts`
- [ ] Create `src/services/storageService.ts`:
      — `uploadPetImage(ownerId, imageUri): Promise<string>` → returns download URL
      — Store under `petImages/{ownerId}/{timestamp}.jpg`
      — Compress before upload using `expo-image-manipulator` (consider installing)
- [ ] Wire into the Add/Edit Pet modal in `app/(tabs)/index.tsx`:
      — Replace the static `petImageSources` lookup with a remote URL when `ImageType === 'url'`
      — Call `uploadPetImage` on save and store the download URL in `pet.Image`
- [ ] Update `mapPetRecord` in `userService.js` to pass through URL images unchanged
