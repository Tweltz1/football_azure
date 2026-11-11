# Setting up Hood League on Supabase + Cloudflare Pages

Everything here is done in a web browser and stays on free plans. Work through the parts in order. Keep a
notes file open: you'll copy a few values from one site into another.

| Piece | Free service | What it does |
|---|---|---|
| Website pages | Cloudflare Pages | Builds `frontend/` from GitHub on every push and serves hood-league.com |
| Database + server code | Supabase | Postgres tables, the `api` Edge Function (all `/api/...` routes) |
| Live draft updates | Supabase Realtime | Pushes bids and picks to every browser in the draft room |
| Sign-in | Supabase Auth | "Login with GitHub" and "Login with Google" |

Never paste passwords, keys or secrets into chat. They only go into the settings boxes below.

## Part 1: Create the Supabase project

1. Go to https://supabase.com and click **Start your project**. Sign in with GitHub.
2. Click **New project**.
   - Name: `hood-league`
   - Database password: click **Generate a password**, then save it somewhere safe. You need it in Part 2.
   - Region: the one closest to your league (for example **East US**).
   - Plan: **Free**.
3. Wait a minute for it to finish setting up.
4. Copy these three values into your notes:
   - **Project ID**: in **Project Settings → General** it's listed as "Project ID" (letters like `abcdxyzqwerty`).
   - **Project URL**: `https://<project id>.supabase.co`
   - **anon public key**: in **Project Settings → API Keys**, the key labeled `anon` `public` (the "Legacy API keys" tab if there are two tabs). This one is safe to put in the website.
5. Create a deploy token: open https://supabase.com/dashboard/account/tokens, click **Generate new token**, name it `github-deploy`, and copy it into your notes. It's only shown once.

## Part 2: Let GitHub deploy the database and server code

1. Open https://github.com/Tweltz1/football_azure/settings/secrets/actions
2. Click **New repository secret** three times to add:

   | Name | Value |
   |---|---|
   | `SUPABASE_PROJECT_ID` | Project ID from Part 1 |
   | `SUPABASE_DB_PASSWORD` | Database password from Part 1 |
   | `SUPABASE_ACCESS_TOKEN` | The `github-deploy` token from Part 1 |

From then on, every change under `supabase/` merged to `main` runs the **Supabase API** action, which creates
the tables and deploys the server code. A separate **Keep Supabase awake** action pings the site every three
days so the free project never pauses in the off-season.

## Part 3: Turn on sign-in

You'll need the **callback URL** for both providers: `https://<project id>.supabase.co/auth/v1/callback`

**GitHub login**

1. Open https://github.com/settings/developers and click **New OAuth App**.
   - Application name: `Hood League`
   - Homepage URL: `https://hood-league.com`
   - Authorization callback URL: the callback URL above
2. Click **Register application**, then **Generate a new client secret**. Keep the tab open.
3. In Supabase go to **Authentication → Sign In / Providers → GitHub**, switch it on, paste the **Client ID**
   and **Client secret**, and click **Save**.

**Google login**

1. Open https://console.cloud.google.com/ and create a project called `Hood League` (top-left project menu → **New project**).
2. Go to **APIs & Services → OAuth consent screen** (it may say **Google Auth Platform → Branding**). Choose
   **External**, enter the app name `Hood League` and your email, and save. Under **Audience**, click
   **Publish app** so anyone in your league can sign in.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Authorized redirect URIs: add the callback URL above
4. Click **Create** and copy the **Client ID** and **Client secret**.
5. In Supabase go to **Authentication → Sign In / Providers → Google**, switch it on, paste both values, and **Save**.

**Allowed addresses**

In Supabase go to **Authentication → URL Configuration**:
- Site URL: `https://hood-league.com`
- Redirect URLs: add `https://hood-league.com/**` and `https://*.hood-league.pages.dev/**` and `https://hood-league.pages.dev/**`

## Part 4: Put the website on Cloudflare Pages

1. Go to https://dash.cloudflare.com/sign-up and create a free account (or sign in).
2. Open **Workers & Pages → Create → Pages → Connect to Git**, connect your GitHub account, and pick
   `Tweltz1/football_azure`.
3. Fill in the build settings:
   - Project name: `hood-league`
   - Production branch: `main`
   - Framework preset: **Create React App**
   - Build command: `npm run build`
   - Build output directory: `build`
   - Root directory (under **Advanced**): `frontend`
4. Under **Environment variables**, add:

   | Name | Value |
   |---|---|
   | `REACT_APP_SUPABASE_URL` | Project URL from Part 1 |
   | `REACT_APP_SUPABASE_ANON_KEY` | anon public key from Part 1 |
   | `NODE_VERSION` | `20` |

5. Click **Save and Deploy**. When it finishes, the site is live at `https://hood-league.pages.dev`.

## Part 5: Merge the switch

Merge the pull request that moves the site to Supabase. That runs the **Supabase API** action (check the
**Actions** tab on GitHub for a green tick) and rebuilds the site on Cloudflare. Then open
`https://hood-league.pages.dev`, sign in, create a test league and try a few bids.

## Part 6: Point hood-league.com at Cloudflare

1. In Cloudflare, open the `hood-league` Pages project → **Custom domains → Set up a custom domain** and enter `hood-league.com`.
2. If the domain isn't on Cloudflare yet, Cloudflare walks you through adding it and shows two **nameservers**.
   Log in wherever you bought hood-league.com and replace its nameservers with those two. It can take up to a
   day to switch over; Cloudflare emails you when it's done.
3. Add `www.hood-league.com` the same way if you use it.

## Good to know

- **Everyone signs in again.** Sign-in accounts are new, so people get new user IDs. Old leagues from Azure
  aren't carried over (they're in the expired Azure database); new leagues start fresh.
- **Free plan limits** (Supabase): 500 MB database, 5 GB of traffic a month, 500,000 server calls a month,
  200 people connected live at once. A league draft uses a small fraction of each.
- **Security is tighter than before.** The server now gets the signed-in user from the login token instead of
  trusting the browser, so nobody can bid or run commissioner tools as someone else, and league passwords are
  never sent to browsers.
