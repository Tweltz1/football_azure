# Hood Protocol

A separate iPhone app from Hood League FF and Backseat View (same "Hood" family name, its own app record): a hidden-role party game set at a college all-nighter in a basement. Most of the group are Crew; a few are Narcs, and one of them is the Snitch. The night gets darker as the game goes on, and a "bong rip" power lets the Host see who someone really is. It lives in `hood-protocol/` and has its own GitHub Actions workflow.

Because of the drug references, the App Store age rating must be 17+.

**Modes:** play against bots on one phone; host or join **nearby** (MultipeerConnectivity, no internet, like Hood League's offline draft); host or join **online** with a 4-letter room code (Supabase Realtime broadcast on the Hood League project). Empty seats are filled by bots. The host phone runs the rules and sends each phone only its own view; online messages are encrypted per player.

The engine still uses its original internal names (crew, saboteur, rogueAI, scan...). All player-facing words live in `App/Words.swift`.

The rules, names, art and text are original to this project. Do not copy cards, art or rules text from any other game.

## Layout
- `Engine/`: Swift package `RogueEngine` with every game rule (`GameState`) and the bot players (`Bot`). No UI code, fully unit tested.
- `App/`: SwiftUI app. `Table.swift` (host and guest tables), `Net/` (nearby and online transports, wire format, encryption), `Views/` (home, lobby, game, appearance editor), `Three/` (the SceneKit basement and the blocky 3D characters, built in code with no model files).
- `App/Look.swift`: a player's appearance, sent to the table as a short code (`SeatInfo.look`).
- `project.yml`: XcodeGen spec. The `.xcodeproj` is generated, not committed.
- `tools/`: `basement_icon.py` (the app icon: the Hood League crew from the Hood League icon, in the basement; render its SVG to `AppIcon.png`) and Apple bundle ID registration.

## Accounts, stats and unlocks
- Players can sign in with email and password, register, or continue with Google. This uses Supabase Auth on the Hood League project (`App/Account/Account.swift`, plain HTTPS, tokens in the Keychain).
- Wins are counted on the phone and, when signed in, in `hood_protocol_profiles` (migration `supabase/migrations/20261025230000_hood_protocol_profiles.sql`, applied by the Supabase API workflow when it reaches the live branch). The leaderboard reads the same table.
- Looks unlock with games played and wins (`App/Account/Unlocks.swift`).
- Supabase needs `com.tweltz1.hoodprotocol://auth` under Authentication > URL Configuration > Redirect URLs, or Google sign-in and email links can't come back to the app.
- App Store rule 4.8: an app with Google sign-in must also offer Sign in with Apple. Add it before submitting for review.
- "Delete account" removes the Hood Protocol profile and stats. The sign-in itself is shared with Hood League.

## Bundle identifier
- App: `com.tweltz1.hoodprotocol`

The App Store Connect record "Hood Protocol" exists (created 2026-10-25) and uses this bundle ID. Do not use the Hood League FF or Backseat View records.

## CI and uploading
The workflow **Hood Protocol iPhone** reuses the repository-level `APPLE_TEAM_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` and `APP_STORE_CONNECT_KEY` secrets. They stay in GitHub Actions Secrets and are never pasted into chat or committed.

- Every push or pull request that touches `hood-protocol/` runs `swift test` on the engine (including 1,200 bot-only games) and builds for the iPhone Simulator, with no signing.
- Online play needs the Supabase anon key at build time. The workflow takes `REACT_APP_SUPABASE_ANON_KEY`, or asks Supabase for it with `SUPABASE_ACCESS_TOKEN`, and passes it to xcodebuild. Without either, the build still works but the online buttons are disabled. The key is never committed.
- `[hood-register]` in a commit message registers the bundle ID with Apple.
- `[hood-upload]` in a commit message (on `claude/project-thread-6lgsrr`, `main` or `claude/rogue-protocol-game`, touching `hood-protocol/`) archives and uploads a TestFlight build. The manual `workflow_dispatch` input `upload` does the same.

## Running locally
```sh
cd hood-protocol
swift test --package-path Engine

xcodegen generate
open HoodProtocol.xcodeproj
```
