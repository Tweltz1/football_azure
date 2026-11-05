# Hood Games iPhone app

A second Capacitor wrapper around the same website (`frontend/build`) as the Hood League app
(`ios-app/`), branded for the games. It opens on the Hood Games hub (`/hood-games`): Games Night,
Hood Quest, the draft mini-games and a way into the Hood League website. GitHub builds it on a
macOS machine (`.github/workflows/hood-games-app.yml`), so no Mac is needed.

- `capacitor.config.json`: app name, bundle ID `com.hoodleague.games`, start path `hood-games`, and
  `appendUserAgent: "HoodGames"`, which is how the website knows it's inside this app
  (`frontend/src/native/gamesApp.js`: back links go to the hub, sign-in skips the football/games door).
- `ios/`: the Xcode project, copied from `ios-app/` (same native plugins: nearby drafts and the
  sign-in sheet). `ios/App/App/public` is filled by `npm run sync` and is not committed.
- Sign-in comes back on the same `com.hoodleague.draft://auth` address as the Hood League app, so
  Supabase needs no new redirect URL.
- App icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024x1024), drawn
  from `art/app-icon.html`.

To send a build to TestFlight: create the app in App Store Connect first (My Apps > + > New App,
bundle ID `com.hoodleague.games`), then Actions > Hood Games app > Run workflow, tick
"Upload to TestFlight". It uses the same repo secrets as the Hood League app.
