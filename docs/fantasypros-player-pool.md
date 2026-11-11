# Player Pool Updates

The app can refresh its master player pool from an external NFL player source. The updater writes the same normalized player list into both app surfaces:

- `supabase/functions/_shared/playerData.ts` for new league creation
- `frontend/src/data/playerData.js` for profile/favorites UI

## Default Source: Sleeper

The weekly workflow uses Sleeper by default. Sleeper does not require an API key.

- Player endpoint: `https://api.sleeper.app/v1/players/nfl`
- Bye-week endpoint: ESPN public NFL scoreboard, one regular-season request per week
- Player limit: `350`
- Positions: `QB`, `RB`, `WR`, `TE`, `K`, `DST`
- Ranking method: local sort by Sleeper `search_rank`, depth chart order, position, and name

Sleeper gives us a strong free player universe, but it does not provide expert consensus draft rankings. The updater filters to active players with current NFL teams, requires non-DST players to appear on a Sleeper depth chart, adds DST team rows, and fills bye weeks from ESPN `teamsOnBye` schedule data.

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
4. The generated PR merges itself once the API tests pass, then the API redeploys.

The workflow also runs every Tuesday at 11:00 UTC. It opens a PR only when the generated files change, and merges it automatically so the site updates the same morning.

## Data Rules

The updater stores only the fields the app uses: player ID, name, team, position, rank, and bye week.

Generated player IDs are source-prefixed, for example `sleeper-9509`, `sleeper-BUF`, or `fp-13948`. That keeps favorites tied to the same player across weekly ranking changes. The first generated update may require users with old `player1`-style favorites to reselect favorites once.

Existing leagues are not mutated by weekly updates. A league copies the player pool when it is created, so in-progress drafts stay stable. New leagues created after a weekly update use the latest pool.

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
