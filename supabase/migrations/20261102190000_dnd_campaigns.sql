-- Hood Quest (tabletop adventures): heroes saved to a Google account, campaigns a DM runs over many
-- sessions, and one row per played session with its recap and a snapshot of the party.

create table if not exists public.dnd_characters (
  id text primary key,
  user_id text not null,
  campaign_id text,
  name text not null default '',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists dnd_characters_user_idx on public.dnd_characters (user_id);
create index if not exists dnd_characters_campaign_idx on public.dnd_characters (campaign_id);

create table if not exists public.dnd_campaigns (
  id text primary key,
  owner_id text not null,
  name text not null default '',
  members text[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dnd_campaigns_members_idx on public.dnd_campaigns using gin (members);

create table if not exists public.dnd_sessions (
  id text primary key,
  campaign_id text not null,
  played_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists dnd_sessions_campaign_idx on public.dnd_sessions (campaign_id, played_at);

-- Only the API (which uses the service role key) may touch these tables.
alter table public.dnd_characters enable row level security;
alter table public.dnd_campaigns enable row level security;
alter table public.dnd_sessions enable row level security;
revoke all on public.dnd_characters from anon, authenticated;
revoke all on public.dnd_campaigns from anon, authenticated;
revoke all on public.dnd_sessions from anon, authenticated;
