# Talk Shops (talkshops.app)

Progress updates from car repair shops to their customers. Shops sign in; customers get a text with a
link to their car's page (`/?c=<token>`) and approve or decline repairs there without signing in.

- `public/` is the whole site: plain HTML/JS, no framework.
  - `index.html` + `app.js`: shop sign-in, board, check-in, and the customer page.
  - `demo.html`: demo shop with sample data; `demo.html?tour=1` runs the voice-guided tour (`tour.js`, `tour/`).
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
