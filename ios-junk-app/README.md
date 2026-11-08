# Junk App iPhone app

A third Capacitor wrapper around the same website build (`frontend/build`) as the Hood League (`ios-app/`)
and Hood Games (`ios-games-app/`) apps. It opens on the Junk App pages (`/junk`, code in `frontend/src/junk/`):
free stuff near you, search, posting with photos (Gemini names the item), messages, reporting and blocking.
The `/junk` pages only open inside this app (and in `npm start`); the public website doesn't show them.
GitHub builds it on a macOS machine (`.github/workflows/junk-app.yml`), so no Mac is needed.

- `capacitor.config.json`: app name `Junk App`, bundle ID `com.hoodleague.junk`, start path `junk`, and
  `appendUserAgent: "JunkApp"`, which is how the pages know they're inside this app.
- iPhone only, portrait only (no iPad screenshots needed in App Store Connect).
- Native plugins: `@capacitor/geolocation` (location for nearby items) and the sign-in sheet
  (`AuthSessionPlugin` in `HoodViewController.swift`). Sign-in comes back on the same
  `com.hoodleague.draft://auth` address as the other apps, so Supabase needs no new redirect URL.
- `NearbyPlugin.swift` (nearby-phone drafts) is compiled but never loaded, so the app doesn't ask for Local Network.
- App icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024x1024) and the launch
  screen (`Splash.imageset`), both drawn from `art/app-icon.html`.
- Backend: the `junk/*` routes of the Supabase `api` function (`supabase/functions/_shared/junk.ts`), the
  `junk_*` tables and the public `junk-photos` Storage bucket (`supabase/migrations/20261108150000_junk_app.sql`).
  Item detection uses the same `GEMINI_API_KEY` function secret as the other apps.
- Privacy policy and terms: `frontend/public/junk-privacy.html` and `junk-terms.html` (public, for App Store Connect).

To send a build to TestFlight: create the app in App Store Connect first (Apps > + > New App, bundle ID
`com.hoodleague.junk`), then Actions > Junk App iPhone app > Run workflow, tick "Upload to TestFlight".
It uses the same repo secrets as the Hood League app.
