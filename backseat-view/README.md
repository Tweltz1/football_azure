# Backseat View

See and hear the back seat from the front seat, with a baby card on the CarPlay screen.

## How it works (1.1)
- **Two iPhones.** An old iPhone is the back-seat camera (mounted, plugged in, app open). The driver's
  iPhone is the viewer. Each phone picks its role on first launch.
- **Direct phone-to-phone link.** Network.framework with `includePeerToPeer` (Apple peer-to-peer Wi-Fi,
  like AirDrop) and Bonjour `_backseatview._tcp`. No Wi-Fi network, cell signal or server needed.
  The camera shows a 4-digit pairing code; the driver's phone must send it before getting anything.
- **Camera phone** (`App/CameraStation.swift`): ~2 pictures/second (480 px JPEG), 16 kHz mono sound,
  crying detection with Apple's built-in sound classifier (`baby_crying`, `crying_sobbing`), and a rough
  movement check on a 32x24 brightness grid (overall brightness changes removed). Mood = Crying / Moving / Quiet.
- **Driver phone** (`App/DriverStation.swift`): live picture, baby sound through the car speakers
  (mixes with music and directions), and a Live Activity ("baby card"). Playing the sound
  (background audio mode) is what keeps the app running while the phone is locked.
- **Car screen**: iOS 26 CarPlay shows Live Activities on the Dashboard using the `.small` family
  (`Widget/BabyLiveActivity.swift`). The card carries a tiny JPEG (<= 2.3 KB) inside its state because
  ActivityKit caps the state at 4 KB; this avoids needing an App Group. Refresh about every 4 seconds,
  immediately on a mood change, with a chime when crying starts.

## Why not live video on CarPlay?
Apple doesn't allow apps to play video on the CarPlay screen while driving, and widgets refresh only a
few times an hour. The Live Activity card is the fastest-updating thing an ordinary app can put there.

## Build / TestFlight
- `.github/workflows/backseat-view.yml` builds for the simulator on pushes that touch `backseat-view/`.
- Put **[backseat-upload]** in a commit message (touching `backseat-view/`) to archive and upload to TestFlight.
- Bundle IDs: `com.tweltz1.backseatview`, `com.tweltz1.backseatview.widget`. App Store Connect app id 6823795258.

## Limits
- The camera phone must stay in the foreground (iOS doesn't allow the camera in the background).
- Wireless CarPlay also uses the driver phone's Wi-Fi; peer-to-peer Wi-Fi normally runs alongside it,
  but test in the real car.
- Movement detection is rough in a moving car (shadows, bumps). Crying detection is the reliable signal.
- Not a medical or safety device.
