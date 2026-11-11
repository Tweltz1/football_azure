-- Bay Status (repair shop progress updates, on the Test tab). One row per shop, owned by the
-- signed-in user who set it up, and one row per car (job). A job's details live in `data`; its
-- `token` is the long random code in the customer's text link.
create table if not exists public.repair_shops (
  id text primary key,
  owner_id uuid not null unique,
  name text not null,
  phone text not null default '',
  hours text not null default '',
  next_ro integer not null default 1001,
  created_at timestamptz not null default now()
);

create table if not exists public.repair_jobs (
  id text primary key,
  shop_id text not null references public.repair_shops (id) on delete cascade,
  token text not null unique,
  stage text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists repair_jobs_shop_idx on public.repair_jobs (shop_id, updated_at desc);

-- Hands out repair order numbers one at a time, even when two cars are checked in at once.
create or replace function public.repair_next_ro(p_shop text) returns integer
language sql as $$
  update public.repair_shops set next_ro = next_ro + 1 where id = p_shop returning next_ro - 1;
$$;

-- Only the API (which uses the service role key) may touch these tables.
alter table public.repair_shops enable row level security;
alter table public.repair_jobs enable row level security;
revoke all on public.repair_shops from anon, authenticated;
revoke all on public.repair_jobs from anon, authenticated;
revoke all on function public.repair_next_ro(text) from anon, authenticated, public;
