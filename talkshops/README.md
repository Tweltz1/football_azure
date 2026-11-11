# Talk Shops (talkshops.app)

Progress updates from car repair shops to their customers. Shops sign in; customers get a text with a
link to their car's page (`/?c=<token>`) and approve or decline repairs there without signing in.

- `public/` is the whole site: plain HTML/JS, no framework.
  - `index.html` + `app.js`: shop sign-in, board, check-in, and the customer page.
  - `demo.html`: demo shop with sample data; `demo.html?tour=1` runs the voice-guided tour (`tour.js`, `tour/`).
  - Training tab (`training.js`, `training.css`): narrated lessons that run in the demo shop at `demo.html?train=<id>`.
    Scripts are in `tour.js` (`TRAIN`); captions and clips are `tour/lines.json` and `tour/<key>.mp3`.
    Voice: Chatterbox (Resemble AI, MIT) cloned from a Piper `en_US-ryan-high` clip (talkshops/voice-reference-ryan.mp3), exaggeration 0.75, cfg weight 0.35, chunks of about 220 characters, 0.3s between chunks; every clip is checked with Whisper speech-to-text and re-generated if words come out wrong. Scripts in `scripts/narration/`: `generate.py` (the TTS input says "Talkshops" as one word so there's no pause between "Talk" and "Shops"; a question always ends its chunk, and each chunk is retried until the words match, there's no odd pause, and yes/no questions rise in pitch), `check.py` (audits clips: wrong words, odd pauses, "Talk Shops" gap, question pitch) and `cues.py` (rebuilds `tour/caption-cues.json`). Bump `?v=` in tour.js after changing clips. To record clips without a local GPU or Hugging Face access, list the keys in `scripts/narration/queue.txt` and push: `.github/workflows/talkshops-narration.yml` records them on GitHub Actions (CPU), runs the checks and `cues.py`, and commits the MP3s and cues back to the branch. MP3 64 kbps mono 24 kHz, loudness normalized to -16 LUFS.
- Backend: Talk Shops' own Supabase project (database, sign-in, `api` Edge Function), separate from the hobby apps.
  API routes live in `supabase/functions/_shared/shop*.ts`; the function entry is `supabase/functions/talkshops-api/index.ts`
  (served at `/functions/v1/api/shop/...`). Database changes go in `talkshops/supabase/migrations`.

## Supabase project (Talk Shops only)

`.github/workflows/deploy-talkshops-supabase.yml` applies `talkshops/supabase/migrations`, sets the function secrets and
deploys the `api` function on every push to `claude/project-thread-6lgsrr` or `main` that touches this code.
It does nothing until these GitHub repository secrets exist (Settings, Secrets and variables, Actions):

- `TALKSHOPS_SUPABASE_PROJECT_ID` (the project's reference id) and `TALKSHOPS_SUPABASE_DB_PASSWORD`.
  `SUPABASE_ACCESS_TOKEN` is shared with the hobby project.
- Function keys, each optional (the feature stays off without it): `TALKSHOPS_RESEND_API_KEY`,
  `TALKSHOPS_TELNYX_API_KEY`, `TALKSHOPS_TELNYX_FROM`, `TALKSHOPS_TELNYX_PUBLIC_KEY` (texting; Twilio's
  `TALKSHOPS_TWILIO_ACCOUNT_SID`, `TALKSHOPS_TWILIO_AUTH_TOKEN`, `TALKSHOPS_TWILIO_FROM` still work when the Telnyx key is absent), `TALKSHOPS_STRIPE_SECRET_KEY`,
  `TALKSHOPS_STRIPE_WEBHOOK_SECRET`, `TALKSHOPS_GEMINI_API_KEY`.
  `TALKSHOPS_EMAIL_FROM`, `SHOP_LINK_BASE` and `TALKSHOPS_SITE_URL` are set by the workflow itself.

The hourly job (`talkshops-hourly.yml`) and the weekly text sorter retrain use `TALKSHOPS_SUPABASE_PROJECT_ID` once it is
set. Dashboard settings for the project: Authentication, URL Configuration (Site URL `https://talkshops.app`, redirect
`https://talkshops.app/**`); Authentication, SMTP (Resend, sender `Talk Shops <updates@talkshops.app>`); Google sign-in
(add `https://<project>.supabase.co/auth/v1/callback` to the Google OAuth client).

## Cloudflare project (Workers, static assets)

- Repository: this repo, production branch `claude/project-thread-6lgsrr`
- Root directory / path: `talkshops`
- Build command: `node scripts/build.mjs`
- Deploy command: `npx wrangler deploy` (uses `wrangler.jsonc`, serves `public/`)
- Build variables: none needed. `scripts/build.mjs` defaults to the Talk Shops Supabase project (its URL and publishable
  key are public). `TALKSHOPS_SUPABASE_URL` / `TALKSHOPS_SUPABASE_ANON_KEY` override it; the old `SUPABASE_*` variables are ignored.
- Custom domain: `talkshops.app`

Supabase: add `https://talkshops.app/**` to Authentication → URL Configuration → Redirect URLs.
Customer text links use the `SHOP_LINK_BASE` function secret (`https://talkshops.app/?c=`).

## Plans and payments (Stripe)

New shops start a free trial; shops created before plans existed have no limits (`plan` is null).
- Trial rules live in Supabase, Table Editor → `talkshops_settings`: `trial_days` (15 or 30), `trial_texts`, `trial_cars`.
  Changes apply to shops that sign up afterwards.
- Plans and prices: `supabase/functions/_shared/shopPlans.ts` (`PLANS`). Checkout builds the price on the fly, so no
  Stripe products need to be created. Promo codes made in Stripe work on the payment page.
- Function secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (GitHub secrets `TALKSHOPS_STRIPE_*`, see above).
- Stripe webhook endpoint: `https://<project>.supabase.co/functions/v1/api/shop/stripe-webhook`, events
  `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Turn on the customer portal once in Stripe (Settings → Billing → Customer portal) so Manage billing works.

## Owners and technicians

Each sign-in account belongs to one shop, as an **Owner** or a **Technician** (`supabase/functions/_shared/shopStaff.ts`,
tables `repair_shop_members` and `repair_shop_invites`). The account that created the shop is its main owner and can't be
removed. Owners invite staff from Settings → Team; the email (Resend) links to `/?join=<token>`, and the person must sign in
with the invited email. The API enforces the roles: technicians can't change settings or saved prices, use Plan checkout or
billing, create final bills, close, reopen or delete repairs, send an estimate for approval, or manage the team.

## Incoming SMS and Smart Replies

Texts go through **Telnyx** when `TELNYX_API_KEY` is set (otherwise Twilio). `TELNYX_FROM` is the Talk Shops number in
+1 format (or the Messaging Profile id), and `TELNYX_PUBLIC_KEY` is the account's webhook public key (Mission Control,
Account Settings, Keys & Credentials, Public Key). In the Telnyx Messaging Profile, set the inbound webhook URL to
`https://<project>.supabase.co/functions/v1/api/shop/incoming-sms` (API v2). The handler checks the Ed25519 signature,
rejects requests older than five minutes, checks the receiving number, and sends any automatic reply through the
Telnyx API. Twilio webhooks to the same URL are still checked with Twilio's signature. US numbers need 10DLC
registration (brand and campaign) before carriers deliver texts. A unique active repair and prior outbound SMS are
required to attach an incoming text.

Owners on Pro or an active trial can enable individual automatic topics in Settings, supply a signature and set an after-hours schedule. All topics start off. Staff can review drafts and pause automatic replies on one repair. Automatic texts count against the allowance. The public demo at `/demo.html?smart=1` uses sample messages locally.

## Online booking and appointment hours

Every plan has a public booking link (`/?book=<token>`, Settings, Online Booking). Without appointment hours, customers ask for
a day and a part of the day and the shop confirms a time. With **Appointment hours** set (open and close per weekday, how far
apart appointments start, cars at the same time, notice needed, how far ahead), the page shows the open times and the
customer picks one. Times already booked or waiting on the shop are hidden. The shop can confirm each request or turn on
instant booking, which puts the car on the Bay as "invited" with the appointment set and sends the confirmation. A reminder
text goes out 24 hours before (hourly job), only to customers who agreed to messages, and never after STOP.
Rules live in `supabase/functions/_shared/shopSchedule.ts`; settings are saved in `repair_shops.grow.schedule`. The Bay lists
the next week's appointments above the columns. The demo shop works the same way from the browser (`Grow.openSlots`).
