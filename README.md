View App on GH Pages: https://nicktroutwine93.github.io/RetrievedNative/

# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## Deploy to GitHub Pages

This project is configured for GitHub Pages static deployment.

1. Push to `main` (or run the workflow manually):

   - Workflow file: `.github/workflows/deploy-gh-pages.yml`

2. In your GitHub repository settings:

   - Go to `Settings > Pages`
   - Set `Source` to `GitHub Actions`

3. The workflow exports web to `dist`, creates `404.html` from `index.html` for SPA route fallback, and deploys to Pages.

Required repository secrets for the build step:

- `EXPO_PUBLIC_FB_API_KEY`
- `EXPO_PUBLIC_FB_DOMAIN`
- `EXPO_PUBLIC_FB_PROJID`
- `EXPO_PUBLIC_FB_STORAGE_BUCKET`
- `EXPO_PUBLIC_FB_MSGSENDERID`
- `EXPO_PUBLIC_FB_APPID`
- `EXPO_PUBLIC_FB_MEASUREMENTID`
- `EXPO_PUBLIC_MAPTILER_API_KEY` (recommended for map rendering)

## Firestore Location Privacy Hardening

This repo now supports a split model for search origins:

- `searches/{id}.Location`: obfuscated coordinate only (safe for broad client reads)
- `searchOrigins/{id}.Location`: exact coordinate (owner-only)

Apply rules:

1. Merge/deploy [firestore.location-privacy.rules](firestore.location-privacy.rules) into your active Firestore rules.
2. Keep your existing collection-specific write protections, then include the `searchOrigins` owner-only match block.

Migrate legacy documents that still have exact coordinates in `searches.Location`:

1. Install admin SDK once:

   ```bash
   npm install firebase-admin
   ```

2. Run dry-run first:

   ```bash
   node scripts/migrate-search-origins-admin.js --project=<your-project-id> --dry-run
   ```

3. Run live migration:

   ```bash
   node scripts/migrate-search-origins-admin.js --project=<your-project-id>
   ```

Notes:

- Expo Router project path is set via `expo.experiments.baseUrl` in `app.json`.
- If your repository name is not `RetrievedNative`, update `baseUrl` accordingly.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
