# Grocery Runner iPhone app

Type your grocery list, pick your store, and get the shortest walk through it: a numbered stop list and
a store map with the route drawn on it. Built with Expo (React Native). GitHub builds it on a macOS
machine (`.github/workflows/grocery-runner-app.yml`), so no Mac is needed.

## What it does
- **List**: add items, check them off, tap one to set its aisle or department.
- **Store**:
  - Kroger family stores (Kroger, Fry's, King Soopers, Ralphs, Smith's, Fred Meyer, ...): find by ZIP.
    Aisles fill in automatically from the official Kroger API.
  - Any other store (Walmart, Hy-Vee, Target, Costco, local grocers): name + number of aisles. Items are
    sorted by department, and any aisle you type is remembered for that store next time.
- **Route**: A* walking paths on a store grid, stops ordered for the shortest total walk, with
  "Frozen and dairy last" on by default. Items at the same spot are grouped into one stop.
- Data stays on the phone (no account).

See [ARCHITECTURE.md](ARCHITECTURE.md) for how locations are sourced and how routing works.

## Layout
- `src/app/` screens (Expo Router): `index` list, `store` picker, `item/[id]` set location, `route` map.
- `src/lib/routing/` the routing engine: `grid.ts`, `astar.ts`, `layout.ts` (generic store floor plan),
  `tour.ts` (stop order), `planRoute.ts` (ties it together).
- `src/lib/` `kroger.ts` client, `departments.ts` keyword guesses and walk order, `store.tsx` app data.
- `supabase/functions/kroger/` the server side of Kroger lookup, so the Kroger secret never ships in the app.
- `tests/` routing tests (`npm test`).
- `app.json` name, bundle ID `com.tweltz1.groceryrunner`. `ios/` is generated on the build machine and not committed.

## One-time setup
1. **App Store Connect**: My Apps > + > New App, platform iOS, name "Grocery Runner", bundle ID
   `com.tweltz1.groceryrunner` (the workflow registers the bundle ID on its first run, so run it once
   first if it isn't in the list).
2. **Kroger API keys** (free): sign up at https://developer.kroger.com, create an app with the
   **Product** scope (public, production environment), and copy its client ID and secret.
3. In GitHub: repo **Settings > Secrets and variables > Actions > New repository secret**, add
   `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`. The Apple and Supabase secrets are already there from
   the other apps.

## Builds (TestFlight)
- Any push touching `grocery-runner-app/` runs the tests, builds for the simulator and pushes
  screenshots to the `grocery-runner-screenshots` branch. It also deploys the Kroger function once
  the Kroger secrets exist.
- Put `[grocery-upload]` in a commit message (or Actions > Grocery Runner iPhone app > Run workflow >
  tick "Upload to TestFlight") to send a build to TestFlight.

## Local dev (optional)
`npm install`, then `npx expo start` and scan the QR code with Expo Go. `npm test` runs the routing tests.
For Kroger lookup locally, create `.env.local` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
