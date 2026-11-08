# Apple Health activation
The native read-only step-count bridge is implemented. The free Personal Team build deliberately leaves HealthKit disabled, so existing app installations remain signable.

After enrolling in the Apple Developer Program:
1. In Xcode select the paid team for App and enable the HealthKit capability. Do not enable background delivery or clinical records; this app reads only today's steps while open.
2. Set CODE_SIGN_ENTITLEMENTS to HealthKit.entitlements for the App target and enable HealthKit for the app identifier / regenerate the signing profile.
3. Set ShavitHealthKitEnabled to true in App/Info.plist.
4. Build, install, choose Connect Apple Health, and allow reading Steps on the iPhone. Verify an Apple Watch + iPhone count against Health and test revoked / denied permissions. No HealthKit data is written or uploaded by Shavit.
5. Apple intentionally does not expose read-denial status. A missing count is shown as no steps shared, rather than a fabricated zero.
