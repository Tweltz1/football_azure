-- Card table games (500 and Dirty Clubs), played on phones. One row per game: the host phone saves it
-- after every hand, so an unfinished game can be picked up later, and finished games feed the stats.
create table if not exists public.card_games (
  id text primary key,
  game text not null,
  finished boolean not null default false,
  summary jsonb not null default '{}'::jsonb,
  state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists card_games_game_idx on public.card_games (game, finished, updated_at desc);

-- Only the API (which uses the service role key) may touch this table.
alter table public.card_games enable row level security;
revoke all on public.card_games from anon, authenticated;
