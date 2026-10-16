# Backseat View — separate CarPlay widget TestFlight experiment

This is a **separate iPhone app** from Hood League FF. It lives in `backseat-view/` and uses its own GitHub Actions workflow. Existing fantasy app code and workflow remain unchanged.

**Purpose of first build:** confirm a *static, raster illustration* inside a small WidgetKit widget can appear on the actual vehicle's CarPlay widget screen. This does **not** provide a live baby camera on CarPlay or a five-second updated photo.

## Bundle identifiers to register in Apple Developer
- App: `com.tweltz1.backseatview`
- Widget extension: `com.tweltz1.backseatview.widget`

**Apple App Store Connect:** Create a separate iOS app record titled `Backseat View`, using the first bundle ID. Create/register both identifiers in Certificates, Identifiers & Profiles and allow Xcode automatic cloud signing. Do not use the Hood League FF app record.

**GitHub secrets:** This build workflow reads the same repository-level `APPLE_TEAM_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, and `APP_STORE_CONNECT_KEY` as Hood League FF. These stay in GitHub Actions Secrets and are NEVER pasted into chat or committed.

## CI and uploading
- On changes to this folder on `feature/backseat-view-carplay-widget`, GitHub Actions compiles the **iPhone Simulator** build only, no signing required.
- To upload a TestFlight build after registering the Apple app and identifiers, push a commit to this branch with **[backseat-upload]** in its commit message, changing something under `backseat-view/`. This invokes the same workflow's release path and uses existing signing secrets.
- The workflow also offers a manual `workflow_dispatch` input `upload` if GitHub lists it in Actions.
- Check GitHub → Actions → **Backseat View iPhone** for simulator/compiler errors before attempting the TestFlight upload.
- TestFlight app must use the bundle identifier `com.tweltz1.backseatview`.

## CarPlay check
1. Install the Backseat View TestFlight build on iPhone running iOS 26 or later.
2. While parked, go to Settings → General → CarPlay → your vehicle → Widgets → Add Widgets.
3. Look for **Backseat View Photo Test**; add it and check your car's Widgets screen.
4. Report whether the *static illustration* displays. It is intentionally not live.

## Camera preview (iPhone only)
The app accepts direct `http(s)://camera/...jpg` endpoints and polls them at five-second intervals **while the app is in foreground**. This is not Bluetooth pairing, not background monitoring, not a baby-safety system, and not available on CarPlay. Some cameras will require proprietary SDKs; wireless CarPlay may interfere with camera hotspots.

## Security / limitations
This is a development-only prototype. HTTP support is enabled to test local cameras; a commercial version needs transport security, protected credentials, hardware testing, privacy disclosures, and App Store review. Secure any camera mounting so it isn't a projectile, and do not interact with a phone while driving.
