-- Hood Protocol (iPhone party game): one profile per signed-in player with their stats.
-- Written so it can run more than once: the Hood Protocol workflow applies it ahead of `supabase db push`.

create table if not exists public.hood_protocol_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  look text not null default '',
  games integer not null default 0,
  wins integer not null default 0,
  crew_wins integer not null default 0,
  narc_wins integer not null default 0,
  snitch_wins integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists hood_protocol_profiles_wins on public.hood_protocol_profiles (wins desc);

alter table public.hood_protocol_profiles enable row level security;

-- Anyone can read names, looks and stats for the leaderboard. Writes go through the functions below.
drop policy if exists "Hood Protocol profiles are public" on public.hood_protocol_profiles;
create policy "Hood Protocol profiles are public" on public.hood_protocol_profiles for select using (true);

-- Saves name and look, and merges counts kept on the phone before signing in (the larger count wins).
create or replace function public.hp_save_profile(
  p_name text, p_look text, p_games integer, p_wins integer,
  p_crew_wins integer, p_narc_wins integer, p_snitch_wins integer
) returns public.hood_protocol_profiles
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  saved public.hood_protocol_profiles;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  insert into public.hood_protocol_profiles as p
    (user_id, display_name, look, games, wins, crew_wins, narc_wins, snitch_wins)
  values (
    me, left(coalesce(nullif(trim(p_name), ''), 'Player'), 20), left(coalesce(p_look, ''), 60),
    greatest(coalesce(p_games, 0), 0), greatest(coalesce(p_wins, 0), 0),
    greatest(coalesce(p_crew_wins, 0), 0), greatest(coalesce(p_narc_wins, 0), 0), greatest(coalesce(p_snitch_wins, 0), 0)
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    look = excluded.look,
    games = greatest(p.games, excluded.games),
    wins = greatest(p.wins, excluded.wins),
    crew_wins = greatest(p.crew_wins, excluded.crew_wins),
    narc_wins = greatest(p.narc_wins, excluded.narc_wins),
    snitch_wins = greatest(p.snitch_wins, excluded.snitch_wins),
    updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

-- Adds one finished game. p_role is 'crew', 'narc' or 'snitch'.
create or replace function public.hp_record_game(p_role text, p_won boolean)
returns public.hood_protocol_profiles
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  won integer := case when p_won then 1 else 0 end;
  saved public.hood_protocol_profiles;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  insert into public.hood_protocol_profiles as p (user_id, games, wins, crew_wins, narc_wins, snitch_wins)
  values (
    me, 1, won,
    case when p_role = 'crew' then won else 0 end,
    case when p_role = 'narc' then won else 0 end,
    case when p_role = 'snitch' then won else 0 end
  )
  on conflict (user_id) do update set
    games = p.games + 1,
    wins = p.wins + won,
    crew_wins = p.crew_wins + case when p_role = 'crew' then won else 0 end,
    narc_wins = p.narc_wins + case when p_role = 'narc' then won else 0 end,
    snitch_wins = p.snitch_wins + case when p_role = 'snitch' then won else 0 end,
    updated_at = now()
  returning * into saved;
  return saved;
end;
$$;

-- "Delete account" in the app: removes the player's Hood Protocol profile and stats.
create or replace function public.hp_delete_profile()
returns void
language sql security definer set search_path = public as $$
  delete from public.hood_protocol_profiles where user_id = auth.uid();
$$;

revoke all on function public.hp_save_profile(text, text, integer, integer, integer, integer, integer) from public, anon;
revoke all on function public.hp_record_game(text, boolean) from public, anon;
revoke all on function public.hp_delete_profile() from public, anon;
grant execute on function public.hp_save_profile(text, text, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.hp_record_game(text, boolean) to authenticated;
grant execute on function public.hp_delete_profile() to authenticated;
grant select on public.hood_protocol_profiles to anon, authenticated;
