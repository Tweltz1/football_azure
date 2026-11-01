-- Hood League tables. Each league is one JSON document (the same shape the Cosmos DB "Leagues"
-- container held), plus a few copied columns for lookups and a version for safe concurrent saves.

create table if not exists public.leagues (
  id text primary key,
  name text not null,
  admin_id text not null,
  members text[] not null default '{}',
  data jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leagues_members_idx on public.leagues using gin (members);
create index if not exists leagues_name_idx on public.leagues (name);

create table if not exists public.profiles (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Only the API (which uses the service role key) may touch these tables.
alter table public.leagues enable row level security;
alter table public.profiles enable row level security;
revoke all on public.leagues from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
