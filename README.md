# Shavit — your cool friend
A device-only daily planner and workout journal. Navy mobile interface, Sunday-start week, custom multi-activity workout schedule, reusable exercise plans, warm-up/working sets, kg/reps, previous session comparisons, rest-aware workout streaks, one-time and recurring tasks, and native 9 AM local reminders.

## Run and verify
- `npm run dev` — local preview
- `npm run test:helper` — workout parsing, streak, history, task and backup validation checks
- `npm run app:sync` — production web build, offline shell generation and Capacitor sync
- `npm run app:check` — storage and native configuration checks
- `npm run app:ios` — sync and open Xcode

## Data
Browser IndexedDB and native Preferences are independent, local stores. JSON export/import moves data between them. Private workout imports must never go in public/, dist/, or source commits. Text note import uses `Exercise 40x8 60x6 60x6` per line; wrapped set lines work. First sets default to warm-up. Screenshots are not automatically OCRed.

New workout plans can be pasted or typed in Workouts. Blank sessions support adding exercises with total and warm-up set counts. Use “Use these exercises as my plan” to reuse an edited session. Historical completed sessions supply previous results. Version 2 migrates existing single-workout schedules and history. Schedule days contain custom-named Lift/Run activities, each with its own session key; runs store km, minutes and notes. Streaks start at onboarding and count days on which all scheduled activities are completed; rest days preserve them and today is not missed until midnight.

## iPhone
App ID remains com.shavitcoolfriend.app, version 2.0 build 3. Install the rebuilt app through Xcode. Enable 9 AM notifications in More and accept the iOS prompt. Native reminders use the official Capacitor LocalNotifications plugin and do not need a server. Real-device notification delivery still requires testing. App Store distribution still requires the owner's Apple Developer enrollment and release signing.

The clothing interface and its background removal/photo dependencies have been removed. Previous versions remain in Git history; no new runtime imports old wardrobe data.
