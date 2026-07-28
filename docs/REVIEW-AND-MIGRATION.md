# TotaVivo Review and Migration Notes

## Reviewed source

The uploaded full backup, current V7 application, public website, feature list, family page, pilot materials, flyer, demos, PWA manifest, redirects, legal terms, and safety disclaimer were consolidated into this package.

## What is already present in the working application

The V7 source includes Home, Apps, Email, Medications, Calendar, Contacts, Phone, Messages, Bills, Bank, Checking, Caregiver, Insights, Smart Home, Bluetooth, IFTTT, Sensors, Magnifier, Earn, and Settings screens. It also contains first-run setup, voice/read-aloud controls, display and accessibility modes, local persistence, optional Supabase sync, fall-related overlays, emergency beacon and personal alarm interfaces, PWA installation support, and service-worker registration.

## Build 8 changes

- Established Tota Group as the umbrella.
- Renamed the application-facing build to **TotaVivo Life Companion**.
- Added a Tota Group launcher and module registry pattern.
- Created a separate TotaSignal boundary.
- Preserved all existing V7 behavior instead of risking a destructive one-step rewrite.
- Updated the manifest to launch `life-companion.html`.
- Preserved marketing, legal, pilot, family, demo, and printable collateral.

## Important product truth

Several safety, medical, banking, email, rewards, and smart-home experiences are demonstrations or depend on browser/device permissions and outside integrations. They must not be represented as monitored emergency dispatch, certified medical-device operation, direct banking, or guaranteed sensor performance until the corresponding production services and approvals exist.

## Refactor priority

1. Automated navigation and persistence smoke tests.
2. Extract shared state and storage namespaces.
3. Extract safety and medication modules first because they carry the highest risk.
4. Replace inline handlers with delegated events and typed module APIs.
5. Add an integration adapter layer for Supabase, email, finance providers, smart home, and TotaSignal.
6. Add release signing, privacy review, accessibility testing, and device testing.
