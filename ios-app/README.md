# Hood League iPhone app

A Capacitor wrapper that ships the website (`frontend/build`) inside an iPhone
app. GitHub builds it on a macOS machine (`.github/workflows/ios-app.yml`), so
no Mac is needed.

- `capacitor.config.json`: app name, bundle ID `com.hoodleague.draft`.
- `ios/`: the Xcode project (Swift Package Manager, iOS 15+). `ios/App/App/public`
  is filled by `npx cap sync ios` and is not committed.
- App icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024x1024).

To send a build to TestFlight: Actions > iPhone app > Run workflow, tick
"Upload to TestFlight". The secrets it needs are listed at the top of the workflow.
