"""Creates Grocery Runner's shared aisle and partner store tables in the Hood League Supabase project. Safe to re-run.

Row level security is on with no policies, so the phone app can't read or write the table directly;
only the grocery-runner function (service role) can. Never prints the access token."""
import json
import os
import urllib.error
import urllib.request

TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = os.environ["SUPABASE_PROJECT_ID"]

SQL = """
create table if not exists public.grocery_aisle_votes (
  store_key text not null check (char_length(store_key) <= 48),
  item_key text not null check (char_length(item_key) <= 80),
  device_id text not null check (char_length(device_id) <= 40),
  aisle text check (char_length(aisle) <= 12),
  department text,
  updated_at timestamptz not null default now(),
  primary key (store_key, item_key, device_id),
  check (aisle is not null or department is not null)
);
-- "typed" (typed in or read from a screenshot) or "learned" (from check-off order, half weight).
alter table public.grocery_aisle_votes add column if not exists kind text not null default 'typed'
  check (kind in ('typed', 'learned'));
alter table public.grocery_aisle_votes enable row level security;
revoke all on public.grocery_aisle_votes from anon, authenticated;
-- Items with shared aisles per store, for the store map.
create or replace view public.grocery_store_coverage as
  select store_key, count(distinct item_key)::int as items from public.grocery_aisle_votes group by store_key;
revoke all on public.grocery_store_coverage from anon, authenticated;

-- Partner stores (store-portal function): a store's own aisle list and weekly deals.
-- key_hash is a SHA-256 of the store's private link key; the key itself is never saved.
create table if not exists public.grocery_partner_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 80),
  chain text not null check (char_length(chain) <= 20),
  lat double precision,
  lon double precision,
  store_key text check (char_length(store_key) <= 48),
  key_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  layout_updated_at timestamptz,
  deals_updated_at timestamptz
);
create table if not exists public.grocery_partner_aisles (
  partner_id uuid not null references public.grocery_partner_stores (id) on delete cascade,
  category text not null check (char_length(category) <= 80),
  aisle text check (char_length(aisle) <= 12),
  department text check (char_length(department) <= 20),
  primary key (partner_id, category),
  check (aisle is not null or department is not null)
);
create table if not exists public.grocery_partner_deals (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.grocery_partner_stores (id) on delete cascade,
  item text not null check (char_length(item) <= 80),
  price text check (char_length(price) <= 40),
  starts_on date,
  ends_on date
);
create index if not exists grocery_partner_deals_partner on public.grocery_partner_deals (partner_id);
alter table public.grocery_partner_stores enable row level security;
alter table public.grocery_partner_aisles enable row level security;
alter table public.grocery_partner_deals enable row level security;
revoke all on public.grocery_partner_stores, public.grocery_partner_aisles, public.grocery_partner_deals
  from anon, authenticated;
"""

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{REF}/database/query",
    data=json.dumps({"query": SQL}).encode(),
    method="POST",
    headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json", "User-Agent": "grocery-runner-setup"},
)
try:
    urllib.request.urlopen(req, timeout=60).read()
except urllib.error.HTTPError as e:
    raise SystemExit(f"Supabase returned {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")
print("grocery_aisle_votes, grocery_store_coverage and partner store tables: ready")
