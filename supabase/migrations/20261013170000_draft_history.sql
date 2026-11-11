-- Finished drafts, kept so they stay viewable after a league resets for a new season.
-- One row per draft; data holds the teams, rosters and pick log (DraftHistoryEntry in models.ts).

create table if not exists public.draft_history (
  id text primary key,
  league_id text not null,
  season integer not null,
  members text[] not null default '{}',
  completed_at timestamptz not null default now(),
  data jsonb not null
);

create index if not exists draft_history_members_idx on public.draft_history using gin (members);
create index if not exists draft_history_league_idx on public.draft_history (league_id);

-- Only the API (which uses the service role key) may touch this table.
alter table public.draft_history enable row level security;
revoke all on public.draft_history from anon, authenticated;
