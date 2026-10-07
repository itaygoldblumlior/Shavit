# Shavit mobile preparation

Prepared: 7 October 2026. Native app ID: com.shavitcoolfriend.app. App version 1.0 / build 1.

## Prepared here

- Capacitor iOS (Swift Package Manager) and Android projects with bundled local web assets, not a remote website loader.
- Existing smiling Shavit app icons and splash artwork.
- Private native clothing files with commit-after-write manifests; existing website IndexedDB remains separate.
- Native preferences for saved fits, music and first-visit settings.
- Native camera/gallery photo entry and export through the OS share sheet.
- Android Back closes dialogs, returns to the outfit screen, or minimizes the app. Camera activity result recovery is wired for Android process recreation.
- Privacy/support pages, draft store text, iOS privacy manifest and usage descriptions.
- Local storage failure/reopen/concurrent-save tests and app configuration checks.

## Build and run

1. Install full Xcode (Capacitor 8 documentation currently specifies Xcode 26+) and Android Studio with SDK 36 / compatible JDK 21. Node 22+ is required. This Mac currently lacks full Xcode and a Java runtime.
2. In this directory: npm ci; npm run app:sync.
3. iOS: npm run app:ios. Select your developer Team in Signing & Capabilities. Use the generated ios/App/App.xcodeproj. Choose a connected phone or simulator. App ID can be changed before first store submission, then update both native projects and config consistently.
4. Android: npm run app:android. Let Android Studio sync Gradle and run on a phone or emulator. Android minimum API is 24; target/compile SDK is 36.
5. Release: Xcode Product → Archive → Distribute App for TestFlight/App Store. Android Studio Build → Generate Signed App Bundle, create/retain an upload key privately, then upload the AAB to Play Console. Keep signing files outside Git.
6. Website publishing and store publishing are separate. Run app:sync after web changes, increment native build numbers, and submit a new app version. Website users retain their current origin/storage.

Official setup: https://capacitorjs.com/docs/getting-started/environment-setup

## Required before a store submission

- Developer accounts, identity verification, store terms and payment are owner steps. None were performed here.
- Full native compilation and physical iPhone/Android tests have not run on this Mac. Generated projects and web builds are not proof of native success.
- Test cold launch in airplane mode with existing clothes. The bundled interface/outfits should work; first-use automatic removal still needs the model download. Test the downloaded model cache; do not advertise fully offline automatic removal until verified.
- First native use now asks before downloading approximately 100 MB (measured from IMG.LY 1.7.0 resources metadata: 88,152,708-byte model + 11,819,815-byte CPU WASM + 25,539-byte runtime module, plus metadata). Verify this notice and consent flow on real devices. Confirm WebAssembly support/memory performance on real devices. A single-thread fallback is configured when cross-origin isolation is unavailable.
- Confirm gallery HEIC conversion, cancellation, camera permission denial, orientation, returning from camera after Android process recreation, backgrounding during inference, and safe-area/keyboard behavior. The file input is a fallback for supported JPG/PNG/WebP.
- Test backup export/import through Files and Android document picker, including moving the existing website wardrobe into the app. The app cannot automatically read browser storage.
- Verify saved fits/music persist through relaunch and app upgrade; low-storage failures preserve existing clothing. Large wardrobes and orphan cleanup after interrupted native writes need stress testing.
- Resolve IMG.LY background-removal licensing before distributing. The installed dependency is AGPL-3.0. This preparation does not grant a commercial license or decide the project's license. Use an appropriate commercial license, a compatible replacement, or a reviewed distribution approach that meets license obligations and store terms. Third-party notices alone are not sufficient.
- Complete privacy/Data safety and age-rating forms from observed release behavior, not just the draft. Review privacy text and verify provider behavior.
- Capture device screenshots using public/sample assets. Native/store icons and a Google Play 1024×500 feature graphic are prepared in app-store/assets; screenshots are intentionally not fabricated from the user's wardrobe.
- Run TestFlight and Google's required closed testing for a new personal developer account, then submit for review. Approval is not guaranteed.

## Current checks

npm run app:check — native configuration and storage unit tests.
npm run app:sync — Vite production build and both Capacitor platform syncs.
npm audit — dependency security.

No .ipa, signed .aab, signing keys, paid developer account, or store submission was created here.
