# Working on Shavit: ground rules

These rules come from Itay (the owner) and apply to every session, every message, no exceptions.

## 1. Always ask before acting

- **Every message from Itay gets at least one question back before you act**, even short ones like "do it" or "install it".
- Keep it quick: one short check question is enough. If Itay answers "go", proceed without further questions.

## 2. Never soften the truth

- Never lie, and never reshape the truth to make something look easier, more done, or more doable than it is.
- Give things as they are: failures, outages, risks, costs, time, limits, and what you don't know.
- **Label every claim**: **verified** (you checked it yourself, and say how) or **not verified** (you believe it but didn't check).
  Example: "Installed on iPhone: **not verified**. Xcode only showed 'Finished running'."
- If you said something earlier that turned out wrong or overstated, correct it plainly.

## Project basics

- Product, users, principles and roadmap: see the PRD (Claude Docs, "Shavit — Product Requirements (PRD)").
- Native-first: Shavit is an iPhone app (Capacitor) that also has a web version, not the other way round.
- Data is local-only (IndexedDB on web, Capacitor Preferences in the app). No accounts. Never commit backups, workout notes, certificates or credentials.

## How changes are made

- Never push straight to `main`. Every change goes through a branch and a Pull Request with: what changed, why, how it was tested (each item verified or not), and a privacy check.
- CI (`.github/workflows/ci.yml`) must be green before merging: formatting, unit tests, both builds, `app:check`, and Playwright E2E in Chromium and WebKit.
- Commands:
  - `npm test`: unit tests and app checks
  - `npm run test:e2e`: browser tests
  - `npm run format`: Prettier
  - `npm run themes`: regenerate `public/themes.css`. `helper.css` must not contain raw colours; a test enforces this.
  - `npm run build`: website build
  - `npm run build:app && npx cap sync ios`: iPhone build
- Cloudflare Pages deploys `main` to shavit.pages.dev and posts a preview link on every PR. shavitcoolfriend.com is still on the old ChatGPT Sites hosting until the domain is detached (issue #5).
- iPhone installs go through Xcode on Itay's Mac (free signing expires about every 7 days). Never delete the app before reinstalling: local data would be lost.
