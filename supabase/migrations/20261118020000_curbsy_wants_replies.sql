-- Curbsy: "Looking for" posts, and replies to "Contact Curbsy" messages shown in the app. API / service role only.
create table if not exists public.junk_wants (
  id uuid primary key,
  owner_id uuid not null,
  owner_name text not null default '',
  title text not null,
  note text not null default '',
  category text not null default 'other',
  lat double precision not null,
  lng double precision not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists junk_wants_open_idx on public.junk_wants (lat, lng) where status = 'open';
create index if not exists junk_wants_owner_idx on public.junk_wants (owner_id, created_at desc);
alter table public.junk_wants enable row level security;
revoke all on public.junk_wants from anon, authenticated;

alter table public.junk_feedback add column if not exists reply text;
alter table public.junk_feedback add column if not exists replied_at timestamptz;
