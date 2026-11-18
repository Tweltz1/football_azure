-- Hood League weekly start/sit email (scripts/league-weekly-email.ts): one row per league member who could get it.
-- token makes the one-click unsubscribe link (api route league/email-off) unguessable. API / service role only.
create table if not exists public.league_email_prefs (
  user_id text primary key,
  token text not null default replace(gen_random_uuid()::text, '-', ''),
  weekly_off boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.league_email_prefs enable row level security;
revoke all on public.league_email_prefs from anon, authenticated;
