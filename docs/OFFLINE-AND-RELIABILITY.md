# TotaVivo Offline and Reliability Contract

## Works offline now

- The application shell and bundled assets load from the service-worker cache after the first successful visit.
- User preferences, step history, local activity history, contacts, and other browser-stored state remain available on the device.
- Analytics and crash reports are sanitized, capped at 250 records, and queued locally until connectivity returns.
- The app displays a persistent offline banner instead of silently pretending cloud actions succeeded.

## Requires a connection

- Supabase authentication and cross-device household sync.
- Registry, weather, web search, email, financial-provider, and other external links.
- Downloading a new application version.

## Update behavior

- TotaVivo checks for a new service worker at launch, whenever the app becomes visible, and every 15 minutes while online.
- Executable files use network-first caching, and a newly installed worker activates and reloads the app automatically.
- The Settings button performs a real update check. It does not simulate an update.

## Supabase setup

Run `supabase/migrations/20260919_app_telemetry.sql` in the Supabase SQL editor before expecting queued technical reports to upload. Until then, they remain capped on the device and the application continues to work.

## Next offline milestone

Cross-device data mutations need a typed operation queue with conflict resolution. Until that is implemented, the local copy remains authoritative while offline and cloud changes should be retried after reconnecting.
