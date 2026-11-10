"""Sets up ToteTrack's cloud backup in the Hood League Supabase project. Safe to re-run.

- Creates the totetrack_totes and totetrack_photos tables (each user can only read and write their own rows).
- Adds totetrack://auth to the sign-in return addresses (for Google sign-in).
- Adds the app's bundle ID to the Apple sign-in client IDs.
Only ever adds to existing settings. Never prints the access token."""
import json
import os
import urllib.request

TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = os.environ["SUPABASE_PROJECT_ID"]
API = f"https://api.supabase.com/v1/projects/{REF}"
REDIRECT = "totetrack://auth"
BUNDLE_ID = "com.tweltz1.totetrack"

SQL = """
create table if not exists public.totetrack_totes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb,
  photo text,
  deleted boolean not null default false,
  updated_at bigint not null,
  primary key (user_id, id)
);
alter table public.totetrack_totes enable row level security;
drop policy if exists "totetrack own totes" on public.totetrack_totes;
create policy "totetrack own totes" on public.totetrack_totes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.totetrack_totes to authenticated;

create table if not exists public.totetrack_photos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  data text,
  updated_at bigint not null,
  primary key (user_id, name)
);
alter table public.totetrack_photos enable row level security;
drop policy if exists "totetrack own photos" on public.totetrack_photos;
create policy "totetrack own photos" on public.totetrack_photos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.totetrack_photos to authenticated;
"""


def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json", "User-Agent": "totetrack-setup"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Supabase {method} {path} returned {e.code}: {e.read().decode('utf-8', 'replace')[:300]}") from None


call("POST", "/database/query", {"query": SQL})
print("totetrack_totes and totetrack_photos tables: ready")

auth = call("GET", "/config/auth")
patch = {}

allow = [u.strip() for u in (auth.get("uri_allow_list") or "").split(",") if u.strip()]
if REDIRECT not in allow:
    patch["uri_allow_list"] = ",".join(allow + [REDIRECT])

client_ids = [c.strip() for c in (auth.get("external_apple_client_id") or "").split(",") if c.strip()]
if BUNDLE_ID not in client_ids:
    patch["external_apple_client_id"] = ",".join(client_ids + [BUNDLE_ID])
if not auth.get("external_apple_enabled"):
    patch["external_apple_enabled"] = True

if not auth.get("external_google_enabled"):
    print("::warning::Google sign-in is not enabled in this Supabase project")

if patch:
    call("PATCH", "/config/auth", patch)
    print("Auth settings updated: " + ", ".join(sorted(patch)))
else:
    print("Auth settings: already set")
