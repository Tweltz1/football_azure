-- Talk Shops staff roles (see supabase/functions/_shared/shopStaff.ts). Each signed-in account belongs to at
-- most one shop, as an owner or a technician. The account that created the shop (repair_shops.owner_id) is
-- its main owner and can't be removed. Owners invite staff by email; the link carries a random token that is
-- stored here only as a SHA-256 hash. Only the API (service role) reads or writes these tables.

create table if not exists public.repair_shop_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  shop_id text not null references public.repair_shops (id) on delete cascade,
  role text not null check (role in ('owner', 'tech')),
  email text not null default '',
  name text not null default '',
  added_at timestamptz not null default now()
);
create index if not exists repair_shop_members_shop_idx on public.repair_shop_members (shop_id);

create table if not exists public.repair_shop_invites (
  id text primary key,
  shop_id text not null references public.repair_shops (id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null check (role in ('owner', 'tech')),
  token_hash text not null unique,
  invited_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);
create index if not exists repair_shop_invites_shop_idx on public.repair_shop_invites (shop_id, created_at desc);

-- Every existing shop's account becomes its owner.
insert into public.repair_shop_members (user_id, shop_id, role, email, added_at)
select s.owner_id, s.id, 'owner', coalesce(u.email::text, ''), s.created_at
from public.repair_shops s join auth.users u on u.id = s.owner_id
on conflict (user_id) do nothing;

alter table public.repair_shop_members enable row level security;
alter table public.repair_shop_invites enable row level security;
revoke all on public.repair_shop_members from anon, authenticated;
revoke all on public.repair_shop_invites from anon, authenticated;
