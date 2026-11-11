-- Games page leaderboards: each player's best per game and board (a map's fastest race times, race wins,
-- the five mini-games), plus the practice game or race each player has going, which the API checks a
-- score against. Live race rooms also keep one row per runner (game 'racerun', board = the race id).

create table if not exists public.game_scores (
  game text not null,
  board text not null,
  user_id text not null,
  name text not null default '',
  score double precision not null,
  detail text,
  at timestamptz not null default now(),
  primary key (game, board, user_id)
);
create index if not exists game_scores_board_score on public.game_scores (game, board, score);

create table if not exists public.game_sessions (
  user_id text not null,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- Only the API (which uses the service role key) may touch these tables.
alter table public.game_scores enable row level security;
alter table public.game_sessions enable row level security;
revoke all on public.game_scores from anon, authenticated;
revoke all on public.game_sessions from anon, authenticated;
