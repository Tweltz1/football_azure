# FantasyPros Player Pool Updates

The app can refresh its master player pool from the FantasyPros NFL consensus rankings API. The updater writes the same normalized player list into both app surfaces:

- `api/Shared/PlayerData.cs` for new league creation
- `frontend/src/data/playerData.js` for profile/favorites UI

## Setup

1. Request a FantasyPros API key from FantasyPros.
2. In GitHub, add a repository secret named `FANTASYPROS_API_KEY`.
3. Open GitHub Actions and run `Update FantasyPros Player Pool` manually once.
4. Review and merge the generated PR.

The workflow also runs every Tuesday at 11:00 UTC. It opens a PR only when the generated files change.

## Defaults

- Endpoint: FantasyPros NFL consensus rankings
- Scoring: `PPR`
- Position filter: `ALL`
- Player limit: `350`
- Season: current UTC year unless a manual workflow run provides one

Manual runs can override season, scoring, and limit from the workflow form.

## Data Rules

The updater stores only the fields the app uses: FantasyPros player ID, name, team, position, rank, and bye week. It does not store FantasyPros player image URLs.

Generated player IDs use the FantasyPros stable player ID format: `fp-12345`. That keeps favorites tied to the same player across weekly ranking changes. The first generated update may require users with old `player1`-style favorites to reselect favorites once.

Existing leagues are not mutated by weekly updates. A league copies the player pool when it is created, so in-progress drafts stay stable. New leagues created after a player-pool PR is merged use the latest merged pool.

## Local Run

```bash
FANTASYPROS_API_KEY=your_key_here node scripts/update-player-pool.mjs
```

Optional environment variables:

- `FANTASYPROS_SEASON`
- `FANTASYPROS_SCORING` (`PPR`, `HALF`, or `STD`)
- `FANTASYPROS_LIMIT`
- `FANTASYPROS_POSITION`
- `FANTASYPROS_TYPE`
- `FANTASYPROS_WEEK`
