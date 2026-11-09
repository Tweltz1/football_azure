# Grocery Runner: architecture

## 1. Where item locations come from

Every list item ends up with one `ItemLocation` (`src/lib/types.ts`), tagged with where it came from so
the app can show how much to trust it (`Aisle 14 · Kroger`, `Produce · guess`).

| Tier | Stores | Source | Status |
|---|---|---|---|
| 1. Official API | Kroger family (Kroger, Fry's, King Soopers, Ralphs, Smith's, Fred Meyer, Harris Teeter, ...) | Kroger Public API `GET /v1/products?filter.term=...&filter.locationId=...` returns `aisleLocations` (aisle number, side, bay, shelf) per store | Built |
| 2. Shopper-entered aisles | Any store | The shopper types an aisle once; it is remembered per store and item | Built (on the phone) |
| 3. Department fallback | Any store | Item name → department by keyword (`departments.ts`), placed on a generic floor plan | Built |
| 4. Shared aisle data | Any store | Tier 2 entries pooled across shoppers in Supabase, majority vote per store + item | Planned |

### Kroger request flow
```
iPhone app ──(public anon key)──▶ Supabase function `kroger` ──(client secret, OAuth2)──▶ api.kroger.com
```
The Kroger client secret lives only in Supabase secrets. The function caches its OAuth token and returns
a trimmed product list. Kroger's free tier allows 10,000 product calls per day, which is plenty for an
early app; the next step is caching results per store + item in a Supabase table.

### Walmart, Target, Hy-Vee: why there is no "automated extraction" tier
The original proposal had the backend query the private product endpoints that those retailers' own
apps and websites use. That is not built, on purpose:
- Their terms of use prohibit automated access and scraping of their sites and apps, and those
  endpoints are undocumented and protected by bot detection. They change or block without notice.
- Apple's App Review guideline 5.2 (intellectual property) lets Apple reject or pull an app that uses
  another company's data without permission, and a retailer can send a takedown.
- Home Depot is in the same group: it has no public developer API, only an affiliate program.

Compliant ways to cover these stores, best first:
1. **Shared aisle data** (tier 4): every aisle a shopper confirms at a Walmart helps the next shopper at
   that same store. This is how the app gets better over time, and the data is the app's own.
2. **Partner or affiliate APIs**: Walmart (walmart.io affiliate API) and Target (Partners/Impact) have
   affiliate programs. As far as I know they give product and price data but not aisle numbers, so they
   help with product search and naming, not location. Worth checking each program's current fields.
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
1. Shared aisle data in Supabase (tier 4) with sign in with Apple.
2. Cache Kroger lookups per store + item.
3. Let the shopper pick the exact Kroger product when the first search result is wrong.
4. Per-store layouts for the most-used stores.
