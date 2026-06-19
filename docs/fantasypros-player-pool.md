# Player Pool Updates

The app can refresh its master player pool from an external NFL player source. The updater writes the same normalized player list into both app surfaces:

- `api/Shared/PlayerData.cs` for new league creation
- `frontend/src/data/playerData.js` for profile/favorites UI

## Default Source: Sleeper

The weekly workflow uses Sleeper by default. Sleeper does not require an API key.

- Endpoint: `https://api.sleeper.app/v1/players/nfl`
- Player limit: `350`
- Positions: `QB`, `RB`, `WR`, `TE`, `K`, `DST`
- Ranking method: local sort by Sleeper `search_rank`, depth chart order, position, and name

Sleeper gives us a strong free player universe, but it does not provide expert consensus draft rankings or bye weeks from this endpoint. Generated Sleeper player rows use `bye: 0` until we add a separate bye-week source.

## Optional Source: FantasyPros

Manual workflow runs can still use FantasyPros when a repository secret named `FANTASYPROS_API_KEY` is configured.

FantasyPros defaults:

- Endpoint: FantasyPros NFL consensus rankings
- Scoring: `PPR`
- Position filter: `ALL`
- Player limit: `350`
- Season: current UTC year unless a manual workflow run provides one

## Setup

No setup is needed for the default Sleeper update.

To run the workflow manually:

1. Open GitHub Actions.
2. Run `Update Player Pool`.
3. Leave `source` as `sleeper` unless you want FantasyPros.
4. Review and merge the generated PR.

The workflow also runs every Tuesday at 11:00 UTC. It opens a PR only when the generated files change.

## Data Rules

The updater stores only the fields the app uses: player ID, name, team, position, rank, and bye week.

Generated player IDs are source-prefixed, for example `sleeper-9509` or `fp-13948`. That keeps favorites tied to the same player across weekly ranking changes. The first generated update may require users with old `player1`-style favorites to reselect favorites once.

Existing leagues are not mutated by weekly updates. A league copies the player pool when it is created, so in-progress drafts stay stable. New leagues created after a player-pool PR is merged use the latest merged pool.

## Local Run

Sleeper default:

```bash
node scripts/update-player-pool.mjs
```

FantasyPros optional:

```bash
PLAYER_POOL_SOURCE=fantasypros FANTASYPROS_API_KEY=your_key_here node scripts/update-player-pool.mjs
```

Optional environment variables:

- `PLAYER_POOL_SOURCE` (`sleeper` or `fantasypros`)
- `PLAYER_POOL_LIMIT`
- `FANTASYPROS_SEASON`
- `FANTASYPROS_SCORING` (`PPR`, `HALF`, or `STD`)
- `FANTASYPROS_POSITION`
- `FANTASYPROS_TYPE`
- `FANTASYPROS_WEEK`
