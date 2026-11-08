# Talk Shops (talkshops.app)

Progress updates from car repair shops to their customers. Shops sign in; customers get a text with a
link to their car's page (`/?c=<token>`) and approve or decline repairs there without signing in.

- `public/` is the whole site: plain HTML/JS, no framework.
  - `index.html` + `app.js`: shop sign-in, board, check-in, and the customer page.
  - `demo.html`: demo shop with sample data; `demo.html?tour=1` runs the voice-guided tour (`tour.js`, `tour/`).
  - Training tab (`training.js`, `training.css`): narrated lessons that run in the demo shop at `demo.html?train=<id>`.
    Scripts are in `tour.js` (`TRAIN`); captions and clips are `tour/lines.json` and `tour/<key>.mp3`.
    Voice: Piper `en_US-ryan-high`, length scale 1.1, 0.3s between sentences, MP3 48 kbps mono 22.05 kHz.
- Backend: shared with Hood League in this repo. API routes live in `supabase/functions/_shared/shop.ts`
  (served by the `api` Edge Function at `/api/shop/...`); tables `repair_shops` and `repair_jobs`.

## Cloudflare project (Workers, static assets)

- Repository: this repo, production branch `claude/project-thread-6lgsrr`
- Root directory / path: `talkshops`
- Build command: `node scripts/build.mjs`
- Deploy command: `npx wrangler deploy` (uses `wrangler.jsonc`, serves `public/`)
- Build variable: `SUPABASE_ANON_KEY` (same value as Hood League's `REACT_APP_SUPABASE_ANON_KEY`)
- Custom domain: `talkshops.app`

Supabase: add `https://talkshops.app/**` to Authentication → URL Configuration → Redirect URLs.
Customer text links use the `SHOP_LINK_BASE` function secret (`https://talkshops.app/?c=`).

## Plans and payments (Stripe)

New shops start a free trial; shops created before plans existed have no limits (`plan` is null).
- Trial rules live in Supabase, Table Editor → `talkshops_settings`: `trial_days` (15 or 30), `trial_texts`, `trial_cars`.
  Changes apply to shops that sign up afterwards.
- Plans and prices: `supabase/functions/_shared/shopPlans.ts` (`PLANS`). Checkout builds the price on the fly, so no
  Stripe products need to be created. Promo codes made in Stripe work on the payment page.
- Function secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `TALKSHOPS_SITE_URL` (default https://talkshops.app).
- Stripe webhook endpoint: `https://<project>.supabase.co/functions/v1/api/shop/stripe-webhook`, events
  `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Turn on the customer portal once in Stripe (Settings → Billing → Customer portal) so Manage billing works.

## Owners and technicians

Each sign-in account belongs to one shop, as an **Owner** or a **Technician** (`supabase/functions/_shared/shopStaff.ts`,
tables `repair_shop_members` and `repair_shop_invites`). The account that created the shop is its main owner and can't be
removed. Owners invite staff from Settings → Team; the email (Resend) links to `/?join=<token>`, and the person must sign in
with the invited email. The API enforces the roles: technicians can't change settings or saved prices, use Plan checkout or
billing, create final bills, close, reopen or delete repairs, send an estimate for approval, or manage the team.
