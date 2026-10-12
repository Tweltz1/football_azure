# Hood League

Live fantasy football auction draft room at https://hood-league.com.

| Folder | What it is |
|---|---|
| `frontend/` | React app, hosted on Cloudflare Pages (builds from `main`) |
| `supabase/functions/api/` | The `api` Edge Function that serves every `/api/...` route |
| `supabase/functions/_shared/` | Draft rules, handlers and the generated player pool |
| `supabase/migrations/` | Database tables |
| `supabase/tests/` | API tests: `node --test supabase/tests/handlers.test.ts` |
| `scripts/` | Weekly player pool generator (run by the Update Player Pool action) |

Setup steps for a new environment are in [docs/supabase-cloudflare-setup.md](docs/supabase-cloudflare-setup.md).

To run the site locally against a Supabase project, put `REACT_APP_SUPABASE_URL` and
`REACT_APP_SUPABASE_ANON_KEY` in `frontend/.env.local`, then `cd frontend && npm install && npm start`.
