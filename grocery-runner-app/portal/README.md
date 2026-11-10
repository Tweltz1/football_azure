# Shop Stride for Stores (partner portal)

`index.html` is one static page, no build step. Partner stores use it to send Shop Stride their
**store layout** (which aisle each category is in) and their **weekly deals**. It calls the
`store-portal` Supabase function (`supabase/functions/store-portal/index.ts`), which the
"Shop Stride iPhone app" workflow deploys with the rest of the backend.

- **Store link:** `<page>#key=ssk_…`, one private key per store. Only a SHA-256 hash is saved.
- **Admin:** `<page>#admin`. Only the password's SHA-256 is in the code (`ADMIN_HASH` in the
  function). A `STORE_ADMIN_KEY` GitHub secret (12+ characters), if set, replaces it. Add a store (name, chain, location), copy its link
  (shown once), make a new link if one leaks, or remove a store (deletes its layout and deals).

## What the app does with it
- The store's aisle list beats shopper votes (`aisles` / `store-aisles` actions return it marked
  `official`), shown in the app as "Aisle 7 · store". A list item matches the most specific
  category whose words are all in it ("frozen pizza" for "DiGiorno frozen pizza").
- Deals that match list items show an "On sale" badge on the list and the route, and "Where to shop"
  shows "3 items on sale this week" (small ranking bonus).
- A store is matched to the app's Apple Maps pin by chain + location within 300 m, or by exact app
  store id for Kroger/Walmart. The store must be one of the app's chains for now.

## API (for a store's developers)
```
POST https://nkwedlskhnojseeroezm.supabase.co/functions/v1/store-portal
x-store-key: ssk_…
{"action": "layout", "csv": "Aisle 7: cereal, oatmeal"}            replaces the layout
{"action": "layout", "rows": [{"category": "Cereal", "aisle": "7"}]}
{"action": "deals",  "rows": [{"item": "Milk", "price": "$2.99", "ends": "2026-11-15"}]}
{"action": "store"}                                                  what is saved now
```
Add `"check": true` to see how input is read without saving. Limits: 3,000 layout lines, 1,000 deals.

## Hosting
Supabase won't serve web pages, so the page must be hosted elsewhere as a plain static file
(for example the Hood League Azure Static Web App under `/stores/`). It has no secrets in it.
