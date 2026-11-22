"""Creates Grocery Runner's shared aisle, department and partner store tables in the Hood League Supabase project. Safe to re-run.

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
-- Department fixes ("oat milk" is Dairy), shared across all stores. One vote per phone per item.
create table if not exists public.grocery_department_votes (
  item_key text not null check (char_length(item_key) <= 80),
  device_id text not null check (char_length(device_id) <= 40),
  department text not null
    check (department in ('produce', 'bakery', 'deli', 'meat', 'pantry', 'frozen', 'dairy', 'other',
                          'household', 'health', 'baby', 'pet')),
  updated_at timestamptz not null default now(),
  primary key (item_key, device_id)
);
-- 1.1 added non-food departments; tables made before that still have the old check.
alter table public.grocery_department_votes drop constraint if exists grocery_department_votes_department_check;
alter table public.grocery_department_votes add constraint grocery_department_votes_department_check
  check (department in ('produce', 'bakery', 'deli', 'meat', 'pantry', 'frozen', 'dairy', 'other',
                        'household', 'health', 'baby', 'pet'));
alter table public.grocery_department_votes enable row level security;
revoke all on public.grocery_department_votes from anon, authenticated;

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

-- Store manager sign-in (store-portal function). A manager signs in with an email code, asks for a
-- store (a claim), and Tyler approves it on the admin page. Approved managers are in grocery_store_managers.
alter table public.grocery_partner_stores add column if not exists address text check (char_length(address) <= 160);
alter table public.grocery_partner_stores add column if not exists phone text check (char_length(phone) <= 30);
alter table public.grocery_partner_stores add column if not exists notice text check (char_length(notice) <= 280);
alter table public.grocery_partner_stores add column if not exists notice_updated_at timestamptz;
create table if not exists public.grocery_store_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  person text not null check (char_length(person) <= 80),
  title text check (char_length(title) <= 60),
  phone text check (char_length(phone) <= 30),
  partner_id uuid references public.grocery_partner_stores (id) on delete cascade,
  chain text not null check (char_length(chain) <= 20),
  store_name text not null check (char_length(store_name) <= 80),
  address text check (char_length(address) <= 160),
  lat double precision,
  lon double precision,
  store_key text check (char_length(store_key) <= 48),
  note text check (char_length(note) <= 500),
  work_email boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_note text check (char_length(decided_note) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists grocery_store_claims_status on public.grocery_store_claims (status, created_at);
create table if not exists public.grocery_store_managers (
  partner_id uuid not null references public.grocery_partner_stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  person text check (char_length(person) <= 80),
  title text check (char_length(title) <= 60),
  created_at timestamptz not null default now(),
  primary key (partner_id, user_id)
);
create index if not exists grocery_store_managers_user on public.grocery_store_managers (user_id);
-- Items a manager marked out of stock (shown to shoppers as "Out of stock here"). until = back-in date;
-- with no date the mark shows for 7 days so a forgotten one can't hide an item for good.
create table if not exists public.grocery_partner_outs (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.grocery_partner_stores (id) on delete cascade,
  item text not null check (char_length(item) <= 80),
  until date,
  at timestamptz not null default now()
);
create index if not exists grocery_partner_outs_partner on public.grocery_partner_outs (partner_id);
alter table public.grocery_partner_outs enable row level security;
revoke all on public.grocery_partner_outs from anon, authenticated;
-- Every save, by whom, so a bad edit can be traced. The before-copy lets Tyler undo it.
create table if not exists public.grocery_partner_changes (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.grocery_partner_stores (id) on delete cascade,
  user_id uuid,
  who text check (char_length(who) <= 254),
  what text not null check (char_length(what) <= 40),
  detail text check (char_length(detail) <= 300),
  before jsonb,
  at timestamptz not null default now()
);
create index if not exists grocery_partner_changes_partner on public.grocery_partner_changes (partner_id, at desc);
alter table public.grocery_store_claims enable row level security;
alter table public.grocery_store_managers enable row level security;
alter table public.grocery_partner_changes enable row level security;
revoke all on public.grocery_store_claims, public.grocery_store_managers, public.grocery_partner_changes
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
print("grocery_aisle_votes, grocery_department_votes, grocery_store_coverage, partner store and store manager tables: ready")
