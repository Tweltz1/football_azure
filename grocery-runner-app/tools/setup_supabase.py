"""Creates Grocery Runner's shared aisle table in the Hood League Supabase project. Safe to re-run.

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
alter table public.grocery_aisle_votes enable row level security;
revoke all on public.grocery_aisle_votes from anon, authenticated;
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
print("grocery_aisle_votes table: ready")
