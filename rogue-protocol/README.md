# Rogue Protocol

A separate iPhone app from Hood League FF and Backseat View: a hidden-role party game set on a space station. Most players are loyal crew; a few are saboteurs, and one of them is the Rogue AI. It lives in `rogue-protocol/` and has its own GitHub Actions workflow.

**Current build:** one player against bots on one phone (5 to 10 seats). Online play with friends is planned next, on the existing Supabase backend.

The rules, names, art and text are original to this project. Do not copy cards, art or rules text from any other game.

## Layout
- `Engine/`: Swift package `RogueEngine` with every game rule (`GameState`) and the bot players (`Bot`). No UI code, fully unit tested.
- `App/`: SwiftUI app. `GameController` seats you in seat 0 and runs the bots.
- `project.yml`: XcodeGen spec. The `.xcodeproj` is generated, not committed.
- `tools/`: icon generator and Apple bundle ID registration.

## Bundle identifier
- App: `com.tweltz1.rogueprotocol`

Create a separate App Store Connect record with this bundle ID. "Rogue Protocol" alone is taken on the App Store, so the store name needs a subtitle or a different name; the bundle ID stays the same either way. Do not use the Hood League FF or Backseat View records.

## CI and uploading
The workflow **Rogue Protocol iPhone** reuses the repository-level `APPLE_TEAM_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` and `APP_STORE_CONNECT_KEY` secrets. They stay in GitHub Actions Secrets and are never pasted into chat or committed.

- Every push or pull request that touches `rogue-protocol/` runs `swift test` on the engine (including 1,200 bot-only games) and builds for the iPhone Simulator, with no signing.
- `[rogue-register]` in a commit message registers the bundle ID with Apple.
- `[rogue-upload]` in a commit message (on `main` or `claude/rogue-protocol-game`, touching `rogue-protocol/`) archives and uploads a TestFlight build. The manual `workflow_dispatch` input `upload` does the same.

## Running locally
```sh
cd rogue-protocol
swift test --package-path Engine
swift tools/make_icon.swift
xcodegen generate
open RogueProtocol.xcodeproj
```
