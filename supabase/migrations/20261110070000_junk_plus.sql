-- Curbsy Plus ($4.99/month App Store subscription), tips, saved searches with alerts, notification tokens,
-- and local partners (junk haulers and feed sponsors). Only the API (service role) reads or writes these.

-- One row per Apple subscription; an Apple subscription belongs to one Curbsy account.
create table if not exists public.junk_plus (
  original_transaction_id text primary key,
  user_id uuid not null,
  product_id text not null,
  expires_at timestamptz not null,
  environment text not null default 'Production',
  updated_at timestamptz not null default now()
);
create index if not exists junk_plus_user on public.junk_plus (user_id);

create table if not exists public.junk_tips (
  transaction_id text primary key,
  user_id uuid not null,
  product_id text not null,
  environment text not null default 'Production',
  created_at timestamptz not null default now()
);
create index if not exists junk_tips_user on public.junk_tips (user_id);

create table if not exists public.junk_saved_searches (
  id uuid primary key,
  user_id uuid not null,
  q text not null default '',
  category text,
  lat double precision not null,
  lng double precision not null,
  km double precision not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists junk_saved_searches_user on public.junk_saved_searches (user_id);
create index if not exists junk_saved_searches_spot on public.junk_saved_searches (lat, lng);

create table if not exists public.junk_push_tokens (
  token text primary key,
  user_id uuid not null,
  sandbox boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists junk_push_tokens_user on public.junk_push_tokens (user_id);

-- Local businesses. Add one in the Supabase Table Editor:
--   kind 'hauler' (shown to posters whose stuff isn't going) or 'sponsor' (one card in the Browse feed),
--   name, blurb (one line), phone and/or url, and the area: lat, lng and km (how far from there it serves).
create table if not exists public.junk_partners (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('hauler', 'sponsor')),
  name text not null,
  blurb text not null default '',
  phone text not null default '',
  url text not null default '',
  lat double precision not null,
  lng double precision not null,
  km double precision not null default 40,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists junk_partners_kind on public.junk_partners (kind, active);

-- Every tap on a hauler's Call or Website button, or on a sponsor card: what to bill partners for.
create table if not exists public.junk_partner_taps (
  id uuid primary key,
  partner_id uuid not null references public.junk_partners (id) on delete cascade,
  user_id uuid,
  item_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists junk_partner_taps_partner on public.junk_partner_taps (partner_id, created_at);

alter table public.junk_plus enable row level security;
alter table public.junk_tips enable row level security;
alter table public.junk_saved_searches enable row level security;
alter table public.junk_push_tokens enable row level security;
alter table public.junk_partners enable row level security;
alter table public.junk_partner_taps enable row level security;
