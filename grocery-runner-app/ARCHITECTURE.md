# Shop Stride (Grocery Runner): architecture

## 1. Where item locations come from

Every list item ends up with one `ItemLocation` (`src/lib/types.ts`), tagged with where it came from so
the app can show how much to trust it (`Aisle 14 · Kroger`, `Produce · guess`).

| Tier | Stores | Source | Status |
|---|---|---|---|
| 1. Official API | Kroger family (Kroger, Fry's, King Soopers, Ralphs, Smith's, Fred Meyer, Harris Teeter, ...) | Kroger Public API `GET /v1/products?filter.term=...&filter.locationId=...` returns `aisleLocations` (aisle number, side, bay, shelf) per store | Built |
| 2. Your own aisles | Any store | The shopper types an aisle once; it is remembered on the phone per store and item, and always wins | Built |
| 3. Shared shopper aisles | Walmart, Target, Hy-Vee, Costco, Aldi, Woodman's (and Kroger items the API misses) | Every aisle a shopper types is a vote in Supabase; the majority answer per store + item is used, shown as "Aisle 7 · 3 shoppers" | Built |
| 4. Shared department fixes | Any store | When a shopper picks an item's department, that is a vote for the item at every store; once 2+ shoppers agree and are a majority, it replaces the keyword guess, shown as "Dairy · 3 shoppers" | Built |
| 5. Department fallback | Any store | Item name → department by keyword (`departments.ts`), placed on a generic floor plan | Built |

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

### Shared department fixes
- Table `grocery_department_votes` (`tools/setup_supabase.py`): one row per item + phone, not per store, since
  an item sits in the same department everywhere. Same lockdown as the aisle table (RLS on, no policies).
- Only a department the shopper picks on the item screen is a vote. Aisles and check-off learning are not,
  because an aisle number doesn't say which department it is.
- `tallyDepartments()` in `votes.ts`: an answer is used only with at least 2 phones behind it and more than
  half of all answers for that item. One phone, or a split crowd, leaves the keyword guess alone.
- Order on the phone: this store's aisles (Kroger, then shoppers), then the department this shopper picked
  before (kept on the phone, any store), then the shared department, then the keyword guess. The shopper's
  own answers always win. Same random-phone-id gap as shared aisles.

### Store map
Store pins come from **Apple Maps search on the phone** (`modules/store-search`, a small Swift module
using MKLocalSearch): free, no API key, no server load, and fine for App Store apps. The app searches
each supported chain name near the map center and keeps places whose name matches a chain
(`src/lib/chainMatch.ts`), dropping gas stations, pharmacies and Sam's Club. The server adds the official
Kroger and Walmart store lists (when those keys are set); an official store within 400 m replaces the
Apple Maps pin so its id matches Kroger aisle lookup. Other stores are keyed by chain + position rounded
to ~100 m (`aldi:g43073xm89401`). Each pin is colored by coverage: Kroger aisle data, items mapped by
shoppers (view `grocery_store_coverage`), or not mapped yet.

A first version used OpenStreetMap's public Overpass servers from the Supabase function; they refused
or timed out from Supabase, so that was dropped.

### Aisles from store-app screenshots
Walmart's and Woodman's own apps show aisles, but pulling them automatically would break their terms.
Instead the shopper screenshots items in those apps and picks the screenshots in Shop Stride. Apple's
text recognition (modules/recipe-reader) reads them on the phone; `src/lib/aisleText.ts` finds
"Aisle A38" / "Section 3" / "Aisle U - Shelf A02", splits search-result screenshots into one product card
per aisle, and matches each card to a list item by name. Saved aisles are ordinary shopper votes.
Letter aisles (Woodman's "U") are placed on the map as A = 1, B = 2, ...

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

Two sources adjust the generic plan per store:
- **What shoppers' aisles say** (`src/lib/storeProfile.ts`). The `store-aisles` action returns the
  majority aisle for every item mapped at the store; with this phone's own aisles and the list's, each
  item name is matched to a department by keyword. When two or more items of a department sit within
  one aisle of each other (and are most of that department's answers), the department moves there:
  "frozen waffles" with no aisle goes to the aisle where shoppers put peas and ice cream, and that
  aisle counts as cold for "frozen and dairy last".
- **The building outline** (`src/lib/footprint.ts`, `src/lib/osmBuilding.ts`). Satellite photos only
  show the roof, and Apple's and Google's imagery may not be analysed, so the phone downloads the store's
  building outline, mapped entrances and parking lots from OpenStreetMap (Overpass, once per store, kept
  on the phone, credited on the route screen). The front wall is the one with the entrance, else the one
  facing the biggest parking lot. Its width gives an aisle estimate ((width − 25 m) / 3.4 m), and an
  entrance at the left end mirrors the plan. Overpass is called from the phone, not Supabase, which
  Overpass servers refused earlier.

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

## 4. Recipes

- **Suggested recipes** (`src/lib/recipes.ts`): 30 weeknight recipes ship with the app, so they work offline
  and cost nothing. Opening one ticks every ingredient except pantry staples (salt, oil, ...) and things
  already on the list; "Add" puts the ticked items on the list, where aisles are looked up as usual.
- **Pictures**: a scanned recipe keeps its photo (copied into the app's documents folder; only the file
  name is stored, since iOS moves that folder between updates). A linked recipe uses the page's own
  picture (schema.org `image` or `og:image`, https only). Built-in recipes show their emoji on a colored
  tile: no food photos ship with the app, because stock photos need a license that covers app use.
- **Filters** (`src/lib/diet.ts`): quick (30 min or less), healthy, family, one pot, slow cooker, grill and
  breakfast are set by hand on built-in recipes. Vegetarian, gluten-free and dairy-free are worked out
  from the ingredient names (with look-alikes such as corn tortillas, coconut milk and tamari allowed), so
  scanned and linked recipes get them too. The screen reminds shoppers to check labels on packaged foods.
- **Your recipes** (`src/app/scan.tsx`, `src/lib/readRecipe.ts`): read entirely on the phone, with no AI
  service and no API key (the same idea as Talk Shops' free price sheet reader).
  - Photo (camera or library): Apple's built-in text recognition (Vision `VNRecognizeTextRequest`, local
    module `modules/recipe-reader`) returns each text line with its position. On a two-column cookbook page,
    only the column under the "Ingredients" heading is used; the tallest text near the top is the title.
  - Link: the phone downloads the page and uses its schema.org Recipe data (`recipeIngredient`), which
    nearly every recipe site publishes; otherwise it falls back to the page text.
  - Pasted text: used as is.
  - `src/lib/recipeText.ts` then takes the lines after "Ingredients" (up to "Directions"), or every line that
    starts with an amount, joins lines OCR split in two, and splits each into amount + item by rules for
    numbers, fractions, units and preparation words ("2 cups shredded cheddar cheese, divided" becomes
    "cheddar cheese", "2 cups"). Staples are marked pantry; repeats are merged. Tests: `tests/recipeText.test.ts`.
  - Read recipes are kept on the phone. The shopper reviews every item before it goes on the list, which
    covers the rules' misses (odd layouts, handwriting).
- **Where to shop** (`src/lib/storePick.ts`, `src/app/suggest.tsx`): for the unchecked items on the list,
  the app compares the 3 closest official Kroger-family stores and the closest store of each other chain
  within 15 miles.
  - Kroger stores: the `kroger-stock` action asks Kroger's product API per item at that store and returns
    stock level (high / low / temporarily out), price and aisle. This is the only stock data available.
  - Walmart, Target, Hy-Vee, Costco, Aldi, Woodman's: none of them publish stock data the app may use (see
    section 1), so the app says so and counts how many of the items shoppers have mapped there.
  - Score: Kroger = 100 x share of items in stock; others = 50 + 20 x share of items mapped; minus 3 per
    mile. A Kroger with everything wins unless it is much farther; one missing several items does not.

## 5. Next steps
1. Sign in with Apple and rate limits on shared aisle votes.
2. Cache Kroger lookups per store + item.
3. Let the shopper pick the exact Kroger product when the first search result is wrong.
4. Learn where perimeter departments are (produce left or right) from check-off order.

## Partner stores (layouts and deals)

Stores that partner with Shop Stride send their own data through `portal/index.html` (a private link
per store) or the `store-portal` API; see `portal/README.md`. Tables `grocery_partner_stores`,
`grocery_partner_aisles`, `grocery_partner_deals` (`tools/setup_supabase.py`), service role only.
The store's category list ranks above every other shared source (source `store` in the app), and its
current deals become "On sale" badges. Parsing and matching live in
`supabase/functions/grocery-runner/partnerData.ts` (tested in `tests/partnerData.test.ts`).
