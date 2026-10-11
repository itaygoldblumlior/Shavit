# Shavit mobile preparation

Updated: 11 October 2026. Native app ID: com.shavitcoolfriend.app. iOS version 1.1 / build 2.

## Prepared here

- Full-outfit video/photo import with editable framing suggestions and individual item review. This is not semantic garment detection; concealed clothing cannot be reconstructed. No video or photo uploads.
- Capacitor iOS (Swift Package Manager) and Android projects with bundled local web assets, not a remote website loader.
- Existing smiling Shavit app icons and splash artwork.
- Private native clothing files with commit-after-write manifests; existing website IndexedDB remains separate.
- Native preferences for saved fits, music and first-visit settings.
- Native camera/gallery photo entry and export through the OS share sheet.
- Android Back closes dialogs, returns to the outfit screen, or minimizes the app. Camera activity result recovery is wired for Android process recreation.
- Privacy/support pages, draft store text, iOS privacy manifest and usage descriptions.
- Local storage failure/reopen/concurrent-save tests and app configuration checks.

## Build and run

1. Install full Xcode (Capacitor 8 documentation currently specifies Xcode 26+) and Android Studio with SDK 36 / compatible JDK 21. Node 22+ is required. Xcode 27 is now installed on this Mac. Android tooling remains unverified.
2. In this directory: npm ci; npm run app:sync.
3. iOS: npm run app:ios. Select your developer Team in Signing & Capabilities. Use the generated ios/App/App.xcodeproj. Choose a connected phone or simulator. App ID can be changed before first store submission, then update both native projects and config consistently.
4. Android: npm run app:android. Let Android Studio sync Gradle and run on a phone or emulator. Android minimum API is 24; target/compile SDK is 36.
5. Release: Xcode Product → Archive → Distribute App for TestFlight/App Store. Android Studio Build → Generate Signed App Bundle, create/retain an upload key privately, then upload the AAB to Play Console. Keep signing files outside Git.
6. Website publishing and store publishing are separate. Run app:sync after web changes, increment native build numbers, and submit a new app version. Website users retain their current origin/storage.

Official setup: https://capacitorjs.com/docs/getting-started/environment-setup

## Required before a store submission

- Developer accounts, identity verification, store terms and payment are owner steps. None were performed here.
- Original iPhone build installed and ran on the owner’s physical iPhone on 8 October. Owner reported dice, adding clothes/background removal, save fit, persistence after reopen, backup import and existing outfit browsing in airplane mode working.
- iOS 1.1/build 2 compiled in Release for generic iOS (unsigned) on 11 October. New video recording/import needs a physical iPhone test. An unsigned archive was generated successfully at release-artifacts/Shavit-1.1-build-2.xcarchive. It cannot be uploaded until appropriate signing and the release blockers are resolved. No signed distribution archive or TestFlight upload exists. Android compilation/testing remains unverified.
- Test cold launch in airplane mode with existing clothes. The bundled interface/outfits should work; first-use automatic removal still needs the model download. Test the downloaded model cache; do not advertise fully offline automatic removal until verified.
- First native use now asks before downloading approximately 100 MB (measured from IMG.LY 1.7.0 resources metadata: 88,152,708-byte model + 11,819,815-byte CPU WASM + 25,539-byte runtime module, plus metadata). Verify this notice and consent flow on real devices. Confirm WebAssembly support/memory performance on real devices. A single-thread fallback is configured when cross-origin isolation is unavailable.
- Confirm gallery HEIC conversion, cancellation, camera permission denial, orientation, returning from camera after Android process recreation, backgrounding during inference, and safe-area/keyboard behavior. The file input is a fallback for supported JPG/PNG/WebP.
- Test backup export/import through Files and Android document picker, including moving the existing website wardrobe into the app. The app cannot automatically read browser storage.
- Verify saved fits/music persist through relaunch and app upgrade; low-storage failures preserve existing clothing. Large wardrobes and orphan cleanup after interrupted native writes need stress testing.
- Resolve IMG.LY background-removal licensing before distributing. The installed dependency is AGPL-3.0. This preparation does not grant a commercial license or decide the project's license. Use an appropriate commercial license, a compatible replacement, or a reviewed distribution approach that meets license obligations and store terms. Third-party notices alone are not sufficient.
- Complete privacy/Data safety and age-rating forms from observed release behavior, not just the draft. Review privacy text and verify provider behavior.
- Capture device screenshots using public/sample assets. Native/store icons and a Google Play 1024×500 feature graphic are prepared in app-store/assets; screenshots are intentionally not fabricated from the user's wardrobe.
- Run TestFlight and Google's required closed testing for a new personal developer account, then submit for review. Approval is not guaranteed.

## iPhone release next steps

1. Owner enrolls in Apple Developer Program; paid membership, identity verification and agreements have not been completed.
2. Resolve the installed IMG.LY AGPL background-remover distribution obligations (commercial license/replacement/reviewed compliant distribution). Do not submit until resolved.
3. Install iOS 1.1/build 2 through Xcode on the owner’s phone and test record/import, permission denial/cancellation, frame selection, crop edits, individual piece save, abandoned queue, and wardrobe persistence.
4. Capture real app screenshots using disposable sample clothing and finalize owner-provided rating/privacy answers.
5. Select the paid developer team, archive/sign, upload to App Store Connect, and conduct TestFlight testing before App Store review.

## Video/photo verification on 11 October

Browser QA used disposable synthetic media: MP4 load, frame selection, crop slider adjustment, full-outfit PNG load, review draft queue (1 of 3), automatic background removal, and cancellation without saving. No console errors appeared. Existing user wardrobe was not modified. Recording on a physical iPhone, HEIC decoding, and actual worn-clothing crop quality remain unverified.

## Current checks

npm run app:check — native configuration and storage unit tests.
npm run app:sync — Vite production build and both Capacitor platform syncs.
npm audit — dependency security.

No .ipa, signed .aab, signing keys, paid developer account, or store submission was created here.
