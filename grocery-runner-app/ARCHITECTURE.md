# Grocery Runner: architecture

## 1. Where item locations come from

Every list item ends up with one `ItemLocation` (`src/lib/types.ts`), tagged with where it came from so
the app can show how much to trust it (`Aisle 14 · Kroger`, `Produce · guess`).

| Tier | Stores | Source | Status |
|---|---|---|---|
| 1. Official API | Kroger family (Kroger, Fry's, King Soopers, Ralphs, Smith's, Fred Meyer, Harris Teeter, ...) | Kroger Public API `GET /v1/products?filter.term=...&filter.locationId=...` returns `aisleLocations` (aisle number, side, bay, shelf) per store | Built |
| 2. Your own aisles | Any store | The shopper types an aisle once; it is remembered on the phone per store and item, and always wins | Built |
| 3. Shared shopper aisles | Walmart, Target, Hy-Vee, Costco, Aldi, Woodman's (and Kroger items the API misses) | Every aisle a shopper types is a vote in Supabase; the majority answer per store + item is used, shown as "Aisle 7 · 3 shoppers" | Built |
| 4. Department fallback | Any store | Item name → department by keyword (`departments.ts`), placed on a generic floor plan | Built |

### Request flow
```
iPhone app ──(public anon key)──▶ Supabase function `grocery-runner` ──┬─(OAuth2)──────▶ api.kroger.com
                                                                     ├─(RSA-signed)──▶ Walmart affiliate Store Locator
                                                                     └─(service role)─▶ grocery_aisle_votes table
```
All secrets (Kroger, Walmart, service role) live only in Supabase. The function caches its OAuth token and returns
a trimmed product list. Kroger's free tier allows 10,000 product calls per day, which is plenty for an
early app; the next step is caching results per store + item in a Supabase table.

### Shared shopper aisles
- Store identity: Kroger and Walmart stores come from their official store search (`kroger:<locationId>`,
  `walmart:<store number>`). Target, Hy-Vee, Costco, Aldi and Woodman's are identified by chain + ZIP, plus a street
  when a ZIP has two (`target:50309-ingersoll`). "Other" stores stay on the phone and are never shared.
- Table `grocery_aisle_votes` (`tools/setup_supabase.py`): one row per store + item + phone; voting again
  replaces your old vote. Row level security is on with no policies, so only the function can touch it.
- Item names are normalised (`peanut butter!` = `Peanut  Butter`), aisles are cleaned to short
  values like `14` or `A14`, and the majority answer wins (aisle beats department on a tie, newer beats older).
- Known gap: a random phone id is easy to fake. Before a public launch, add sign in with Apple and
  rate limits so one person can't flood a store with wrong answers.

### Store map
`GET ?action=nearby&lat&lon` returns supported stores within about 15 km: Kroger and Walmart from their
official store APIs when those keys are set (so ids match aisle lookup), everything else from
OpenStreetMap through the Overpass API (credited on the map, as its license requires). Each store
carries its coverage: Kroger aisle data, or how many items shoppers have mapped there (view
`grocery_store_coverage`). Stores picked on the map are keyed by OSM id (`woodmans:osm-w123`), which
is more precise than chain + ZIP. Results are cached per ~1 km for 30 minutes in the function.

### Affiliate APIs: what they give us
- **Walmart** (walmart.io affiliate API): used for its **Store Locator** (real store numbers near a ZIP), so
  votes are shared per actual store. Its product APIs have no aisle data, so they are not used.
- **Target**: no public developer API. Its affiliate side moved to creator programs (Club Target,
  Target Ambassadors with LTK, May 2026), which are for links and commissions, not product data.
- **Hy-Vee**: no public API or affiliate data feed. A partnership request is the only path.

### Walmart, Target, Hy-Vee: why there is no "automated extraction" tier
The original proposal had the backend query the private product endpoints that those retailers' own
apps and websites use. That is not built, on purpose:
- Their terms of use prohibit automated access and scraping of their sites and apps, and those
  endpoints are undocumented and protected by bot detection. They change or block without notice.
- Apple's App Review guideline 5.2 (intellectual property) lets Apple reject or pull an app that uses
  another company's data without permission, and a retailer can send a takedown.
- Home Depot is in the same group: it has no public developer API, only an affiliate program.

Compliant ways to cover these stores, best first:
1. **Shared shopper aisles** (tier 3, built).
2. **Affiliate APIs** (Walmart Store Locator, built; see above).
3. **Ask the retailer**: Hy-Vee is regional and partners with app makers. A data-sharing request is a
   realistic ask once the app has users.

## 2. Store floor plan

No retailer publishes floor plans, so every store uses one generic US grocery layout
(`src/lib/routing/layout.ts`), sized to the store's aisle count:

```
   back wall:  MEAT / SEAFOOD
   +---------------------------------------+
   |D |  |  |  |  ...  |  |  |  | DELI    |
   |A |1 |2 |3 |       |  |  |N | BAKERY  |
   |I |  |  |  |       |  |  |  | PRODUCE |
   |R  front cross-aisle                  |
   +---- checkout ------------- entrance --+
```

Each grid cell is about 5 ft. Shelving and walls are blocked cells; aisles, the front and back
cross-aisles and the perimeter are walkable. An aisle number maps to that aisle's walkway; a Kroger bay
number moves the stop along the aisle. Later, a store can get its own layout (same `StoreLayout` shape)
without changing the router.

## 3. Routing

`planRoute()` in `src/lib/routing/planRoute.ts`:
1. Each unchecked item → its location → a walkway cell. Items at the same cell become one stop.
2. Stop order: distances from every stop to every other by breadth-first search over the grid, then
   nearest-neighbour plus 2-opt, with the entrance fixed as the start and checkout as the end. Lists are
   short, so this is fast and within a few percent of the best possible order.
3. "Frozen and dairy last": cold stops are ordered separately and appended, so they ride in the cart
   for the shortest time.
4. Walking path between consecutive stops: A* with Manhattan distance on a 4-way grid. No diagonals, so
   the path never cuts through a shelf corner.

Tests in `tests/routing.test.ts` cover A* around walls, reachability of every aisle and department,
aisle label parsing, department guessing, stop order, grouping and the cold-last rule.

## 4. Next steps
1. Sign in with Apple and rate limits on shared aisle votes.
2. Cache Kroger lookups per store + item.
3. Let the shopper pick the exact Kroger product when the first search result is wrong.
4. Per-store layouts for the most-used stores.
