-- Talk Shops growth tools: shop logo and color (Pro), review link and online booking settings,
-- the public booking link, and online booking requests waiting for the shop.
alter table public.repair_shops add column if not exists brand jsonb;
alter table public.repair_shops add column if not exists grow jsonb;
alter table public.repair_shops add column if not exists booking_token text;
create unique index if not exists repair_shops_booking_token_idx on public.repair_shops (booking_token) where booking_token is not null;

create table if not exists public.repair_bookings (
  id text primary key,
  shop_id text not null references public.repair_shops (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'accepted', 'declined')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists repair_bookings_shop_idx on public.repair_bookings (shop_id, status, created_at);

-- Only the API (service role) reads and writes booking requests.
alter table public.repair_bookings enable row level security;
revoke all on public.repair_bookings from anon, authenticated;
