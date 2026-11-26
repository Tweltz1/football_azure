# Stork View (formerly Backseat View)

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
  (`Widget/BabyLiveActivity.swift`). The card carries a tiny JPEG (<= 2.3 KB) and how long the current mood has lasted ("Quiet for 12:03") inside its state because
  ActivityKit caps the state at 4 KB; this avoids needing an App Group. Refresh about every 4 seconds,
  immediately on a mood change, with a chime when crying starts.

## Baby monitor at home (sound only)
- **Pairing is AirDrop-style (no code).** The sending phone advertises its Bonjour service with a TXT
  record (`id`, `kind` baby/car). The watching phone lists nearby phones (`NearbyList`); tapping one sends a
  `JoinRequest`, the sending phone shows "… wants to connect" Allow / Don't Allow, and Allow returns a
  random token (`JoinAnswer`) both phones keep (`Pairing` in Link.swift), so later it just connects.
  A plain 4-digit hello is still accepted (mini camera / older builds).
- Two phones, picked from the "Baby monitor at home" card. The **baby phone** (`BabyPhoneScreen`,
  `CameraStation(audioOnly: true)`) sends microphone sound only, advertises as "Baby Phone" on the same
  Bonjour service with its own 4-digit code, and keeps listening while locked (background audio mode).
- The **listening phone** (`ListenScreen`, `DriverStation(home: true)`) plays the sound either
  **All the time** or **Only when there's a noise** (default). `SoundGate` (`App/Listening.swift`) calls
  it a noise when loudness beats the sensitivity level and 3x the room's background hum, keeps the
  last 0.5 s so the start isn't cut off, and keeps the sound on for 8 s after the last noise.
- Lock Screen card "Baby's room" says Quiet / Making sounds / Fussing / Crying. Phone notifications
  (`BabyNotifier`, max one per kind per minute) for crying (Apple sound classifier), fussing (sounds in
  4+ different seconds of the last 20), optionally any sound, and always when the baby phone disconnects.
  Same Wi-Fi or AirDrop range needed.
- **Wi-Fi drop backup.** Home Wi-Fi is used first. If the router drops, `viabilityUpdateHandler` notices
  in ~2 s and the parent phone reconnects; Bonjour also advertises over Apple peer-to-peer Wi-Fi (AWDL,
  what AirDrop uses), so it comes back phone to phone with no router. A pop-up (`RouteBanner`) says
  "Now connected phone to phone" / "over Wi-Fi again" (a notification if the app is in the background),
  and the lost-baby-phone alert waits 15 s so a quick switch doesn't wake you. Needs Wi-Fi + Bluetooth
  switched on (not just joined to a network) and roughly AirDrop range.
- **Away from home (internet backup, `App/Relay.swift`).** If neither Wi-Fi nor phone to phone works,
  both phones use a private room on Supabase Realtime broadcast (shared hobby project; URL + public site
  key written into Info.plist by backseat-view.yml as `StorkRelayURL`/`StorkRelayKey`, and
  `tools/relay_test.mjs` checks the relay every build). The baby phone makes a random room + AES-256
  key and hands them to the parent phone only over the local link (`Packet.relay`), so pair once at
  home. Everything is AES-GCM encrypted on the phone. The parent says "listening" every 4 s; only then
  does the baby phone send: status every 2 s, a 320 px picture every 4 s, sound only during noise at
  8 kHz. Rough data use about 5-10 MB an hour when quiet. Free Supabase allows 5 GB of egress a month
  across the hobby apps.
- **Camera on** (baby phone toggle, saved as `babyPhoneVideo`): the baby phone also sends the picture
  (same frames as the car camera). The listening phone shows it, detects movement with the same
  brightness-grid check, and notifies "Baby is moving" (on by default). The picture pauses if the
  baby phone locks; sound keeps going.

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
