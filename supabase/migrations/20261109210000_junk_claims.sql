-- Curbsy "I'm on my way": one open claim per item and per person, with the trip's distance readings.
-- Only the API (service role key) touches this table. See supabase/functions/_shared/junkClaims.ts.

create table if not exists public.junk_claims (
  id uuid primary key,
  item_id uuid not null,
  owner_id uuid not null,
  claimer_id uuid not null,
  claimer_name text not null default '',
  status text not null default 'active',
  reason text not null default '',
  start_km double precision not null,
  best_km double precision not null,
  best_at timestamptz not null,
  last_km double precision not null,
  last_ping_at timestamptz not null,
  created_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  arrived_at timestamptz,
  ended_at timestamptz
);
create unique index if not exists junk_claims_open_item_idx on public.junk_claims (item_id) where status in ('active', 'arrived');
create unique index if not exists junk_claims_open_claimer_idx on public.junk_claims (claimer_id) where status in ('active', 'arrived');
create index if not exists junk_claims_claimer_idx on public.junk_claims (claimer_id, created_at desc);
create index if not exists junk_claims_item_idx on public.junk_claims (item_id, created_at desc);

alter table public.junk_claims enable row level security;
revoke all on public.junk_claims from anon, authenticated;
