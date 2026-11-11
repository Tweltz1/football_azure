"""Sets up ToteTrack's cloud backup in the Hood League Supabase project. Safe to re-run.

- Creates the totetrack_totes, totetrack_photos and totetrack_lists tables (each user can only read and write their own rows).
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

create table if not exists public.totetrack_lists (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade primary key,
  data jsonb,
  updated_at bigint not null
);
alter table public.totetrack_lists enable row level security;
drop policy if exists "totetrack own lists" on public.totetrack_lists;
create policy "totetrack own lists" on public.totetrack_lists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.totetrack_lists to authenticated;
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
print("totetrack_totes, totetrack_photos and totetrack_lists tables: ready")

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

# In-app account deletion (App Store guideline 5.1.1(v)). The sign-in is shared with Hood League, so
# the sign-in itself is only deleted when no other app's table still has rows for this person.
ACCOUNT_SQL = """
create or replace function public.totetrack_delete_account() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r record;
  shared boolean := false;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from public.totetrack_totes where user_id = uid;
  if to_regclass('public.totetrack_photos') is not null then
    execute 'delete from public.totetrack_photos where user_id = $1' using uid;
  end if;
  if to_regclass('public.totetrack_lists') is not null then
    execute 'delete from public.totetrack_lists where user_id = $1' using uid;
  end if;
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_class k on k.oid = c.conrelid
    join pg_namespace n on n.oid = k.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and n.nspname not in ('auth', 'storage')
      and k.relname not like 'totetrack\\_%'
  loop
    execute format('select exists (select 1 from %s where %I = $1)', r.tbl, r.col) into shared using uid;
    exit when shared;
  end loop;
  if shared then
    return 'data';
  end if;
  delete from auth.users where id = uid;
  return 'account';
end;
$$;
revoke all on function public.totetrack_delete_account() from public, anon;
grant execute on function public.totetrack_delete_account() to authenticated;
"""

call("POST", "/database/query", {"query": ACCOUNT_SQL})
print("totetrack_delete_account function: ready")
