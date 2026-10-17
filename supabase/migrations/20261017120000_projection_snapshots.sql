-- Each week's Sleeper projections, saved while the week is live so the last pre-game numbers
-- can be checked against real results afterwards (the accuracy card on Start/Sit).
-- players maps player id to [position, ppr, half, std, name].

create table if not exists public.projection_snapshots (
  season integer not null,
  week integer not null,
  players jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (season, week)
);

-- Only the API (which uses the service role key) may touch this table.
alter table public.projection_snapshots enable row level security;
revoke all on public.projection_snapshots from anon, authenticated;
