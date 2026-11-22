# Shop Stride for Stores (partner portal)

`index.html` is one static page, no build step. Partner stores use it to keep Shop Stride current:
**items & aisles** (which aisle each item or category is in), **weekly sales**, **out-of-stock items**
and a short **store news** note (holiday hours etc.). It calls the
`store-portal` Supabase function (`supabase/functions/store-portal/index.ts`), which the
"Shop Stride iPhone app" workflow deploys with the rest of the backend.

- **Manager sign-in (main way):** `<page>` with no hash. A manager signs in with an emailed 6-digit code
  (Supabase Auth, the same accounts as the app), then asks to manage a store: name, job title, store phone,
  and either an existing partner store or a new one (chain, name, address, Google Maps location).
  Nothing is editable until Tyler approves the request on the admin page. The admin page flags a work email at
  the chain's own domain (`CHAIN_EMAIL_DOMAINS` in `partnerData.ts`) and links the location in Google Maps;
  the check is to call the store's public number and ask for the person. Approving a new store creates it.
  Tables: `grocery_store_claims`, `grocery_store_managers`.
- **Change log + undo:** every save (by manager, link or admin) goes to `grocery_partner_changes` with a copy
  of what it replaced. Admin → Changes → Undo puts that copy back.
- **Email (optional):** if the shared project has `RESEND_API_KEY`, new requests are emailed to
  `STORE_CLAIM_NOTIFY` (default shopstride@weltzcraft.com) and managers get approved/rejected emails from
  `STRIDE_EMAIL_FROM`. Without it, requests just wait on the admin page.
- **Store link (older way):** `<page>#key=ssk_…`, one private key per store. Only a SHA-256 hash is saved.
- **Admin:** `<page>#admin`. Only the password's SHA-256 is in the code (`ADMIN_HASH` in the
  function). A `STORE_ADMIN_KEY` GitHub secret (12+ characters), if set, replaces it. Add a store (name, chain, location), copy its link
  (shown once), make a new link if one leaks, or remove a store (deletes its layout and deals).

## What the app does with it
- The store's aisle list beats shopper votes (`aisles` / `store-aisles` actions return it marked
  `official`), shown in the app as "Aisle 7 · store". A list item matches the most specific
  category whose words are all in it ("frozen pizza" for "DiGiorno frozen pizza").
- Items the store marked out of stock show "Out of stock here · back by Nov 30" on the list and the route
  (exact item match only, so "milk" out never flags "almond milk"). With no back date a mark shows 7 days.
- The store's news and every current sale show on the app's "Deals this week" screen (from the list
  screen's store card), with an Add button per sale.
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
{"action": "layout-set", "category": "Frozen pizza", "aisle": "12"}  one line
{"action": "deal-add", "item": "Milk", "price": "$2.99", "ends": "11/30"}
{"action": "out-set", "item": "Eggs", "until": "11/30"}
{"action": "notice", "text": "Open 7-3 on Thanksgiving"}
```
Managers send the same actions with `x-manager-token: <access token>` and `"store_id"`. The full list is at the
top of `supabase/functions/store-portal/index.ts`.
Add `"check": true` to see how input is read without saving. Limits: 3,000 layout lines, 1,000 deals.

## Hosting
Supabase won't serve web pages, so the page is a plain static file (no secrets in it) hosted at
**weltzcraft.com/shopstride/stores/**: a copy at `weltzcraft-site/shopstride/stores/index.html` on `main`
(deployed by deploy-weltzcraft-site.yml). After changing this file, copy it there too. The old address
hood-league.com/stores/ forwards there, keeping the `#…` part.

## In the app
Profile → "Store manager? Claim your store" (also under the sign-in buttons) opens the same flow in the app,
signed in with the shopper's own Shop Stride account: claim the chosen store or find one, then edit aisles,
sales, out-of-stock and news. "Shop Stride admin" at the bottom unlocks Tyler's approvals with the admin password.

## Rules
- One request per store at a time, and a store with a manager takes no new requests (search shows "Already
  claimed") until Tyler removes that manager.
- Tyler gets an email (STRIDE_RESEND_API_KEY from WELTZCRAFT_RESEND_API_KEY) with Approve / Deny buttons:
  signed links (`#decide=<id>.<expiry>.<hmac>`, 14 days) that open the page for one more click.
- Managers can add a password after signing up with an email code, then sign in with email + password.
- Live end-to-end check: put `[stride-portal-e2e]` in a commit message (tools/e2e_store_portal.py).
