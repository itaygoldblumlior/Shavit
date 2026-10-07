# Shavit — your cool friend

A device-local wardrobe at https://shavitcoolfriend.com/. Tap clothes to cycle pieces, shuffle outfits, save fits, match colours, and pick clothes from music mood tags. Photos are processed locally with manual erase/restore cutout repair.

## Website

npm ci
npm run dev
npm run build

Vite serves http://127.0.0.1:5173/. Website clothes use IndexedDB; preferences, saved fits and music use localStorage. Storage belongs to that browser and origin. Export backups before changing devices or clearing storage.

## iOS and Android app projects

npm run app:sync
npm run app:ios
npm run app:android
npm run app:check

See app-store/RELEASE.md for tooling, testing and submission requirements; app-store/LISTING.md contains draft store text. Native builds use private files and Preferences, native photo/camera entry, and backup sharing. Browser and app data do not automatically sync; use wardrobe JSON export/import.

Core native UI is bundled for offline browsing. Automatic background removal downloads model/runtime files on first use; fully offline first use is unsupported. Physical device compatibility still needs verification.

## Licensing

The background-removal dependency is IMG.LY @imgly/background-removal 1.7.0 (AGPL-3.0). Store distribution is pending a licensing decision; app-store/RELEASE.md records this release prerequisite. Installing or preparing native projects does not grant distribution rights.
