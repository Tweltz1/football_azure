"""Sets up ToteTrack's cloud backup in the Hood League Supabase project. Safe to re-run.

- Creates the totetrack_totes, totetrack_photos and totetrack_lists tables. Each user reads and writes their own rows,
  plus the rows of the household they joined (household sharing: everyone in a household sees the same totes).
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
-- Household sharing: a member's phone syncs the owner's totes instead of its own. One household per person.
create table if not exists public.totetrack_household (
  member_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  check (member_id <> owner_id)
);
create index if not exists totetrack_household_owner on public.totetrack_household (owner_id);
alter table public.totetrack_household enable row level security;
revoke all on public.totetrack_household from anon, authenticated;
create table if not exists public.totetrack_invites (
  code text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.totetrack_invites enable row level security;
revoke all on public.totetrack_invites from anon, authenticated;

-- True when the signed-in person may use rows stored under `space`: their own, or their household owner's.
create or replace function public.totetrack_can_use(space uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select space = auth.uid()
    or exists (select 1 from public.totetrack_household h where h.member_id = auth.uid() and h.owner_id = space);
$$;
revoke all on function public.totetrack_can_use(uuid) from public, anon;
grant execute on function public.totetrack_can_use(uuid) to authenticated;

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
  using ((select public.totetrack_can_use(user_id)))
  with check ((select public.totetrack_can_use(user_id)));
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
  using ((select public.totetrack_can_use(user_id)))
  with check ((select public.totetrack_can_use(user_id)));
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
  using ((select public.totetrack_can_use(user_id)))
  with check ((select public.totetrack_can_use(user_id)));
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
  if to_regclass('public.totetrack_household') is not null then
    -- Leaves the household this person joined; people who joined theirs go back to their own totes.
    execute 'delete from public.totetrack_household where member_id = $1 or owner_id = $1' using uid;
    execute 'delete from public.totetrack_invites where owner_id = $1' using uid;
  end if;
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

# Household sharing (Pro): the owner makes a 6-letter invite code, family members join with it, and their
# phones then sync the owner's totes. Members can leave; the owner can remove anyone.
HOUSEHOLD_SQL = """
create or replace function public.totetrack_household_info() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  own uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select owner_id into own from public.totetrack_household where member_id = uid;
  if own is null and not exists (select 1 from public.totetrack_household where owner_id = uid) then
    return jsonb_build_object('space', uid, 'role', 'solo', 'members', '[]'::jsonb);
  end if;
  own := coalesce(own, uid);
  return jsonb_build_object(
    'space', own,
    'role', case when own = uid then 'owner' else 'member' end,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'owner', u.id = own, 'me', u.id = uid) order by u.id <> own, u.email), '[]'::jsonb)
      from auth.users u
      where u.id = own or u.id in (select member_id from public.totetrack_household where owner_id = own)
    )
  );
end;
$$;

create or replace function public.totetrack_household_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.totetrack_household where member_id = uid) then
    raise exception 'You are in someone else''s household. Leave it first to start your own.';
  end if;
  delete from public.totetrack_invites where owner_id = uid or expires_at < now();
  -- No 0/O or 1/I, so a code read aloud is typed right.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') into c from generate_series(1, 6);
  insert into public.totetrack_invites (code, owner_id, expires_at) values (c, uid, now() + interval '7 days');
  return c;
end;
$$;

create or replace function public.totetrack_household_join(invite text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  own uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select owner_id into own from public.totetrack_invites where code = upper(trim(invite)) and expires_at > now();
  if own is null then raise exception 'That code isn''t valid. Codes work for 7 days; ask for a new one.'; end if;
  if own = uid then raise exception 'That''s your own household code. Share it with family to let them join.'; end if;
  if exists (select 1 from public.totetrack_household where owner_id = uid) then
    raise exception 'People already share your totes. Remove them first to join another household.';
  end if;
  if (select count(*) from public.totetrack_household where owner_id = own) >= 5 then
    raise exception 'That household is full (6 people).';
  end if;
  insert into public.totetrack_household (member_id, owner_id) values (uid, own)
    on conflict (member_id) do update set owner_id = excluded.owner_id, joined_at = now();
  return public.totetrack_household_info();
end;
$$;

create or replace function public.totetrack_household_leave(member uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if member is null or member = uid then
    delete from public.totetrack_household where member_id = uid;
  else
    -- Only the owner can remove someone.
    delete from public.totetrack_household where member_id = member and owner_id = uid;
  end if;
  return public.totetrack_household_info();
end;
$$;

revoke all on function public.totetrack_household_info() from public, anon;
revoke all on function public.totetrack_household_invite() from public, anon;
revoke all on function public.totetrack_household_join(text) from public, anon;
revoke all on function public.totetrack_household_leave(uuid) from public, anon;
grant execute on function public.totetrack_household_info() to authenticated;
grant execute on function public.totetrack_household_invite() to authenticated;
grant execute on function public.totetrack_household_join(text) to authenticated;
grant execute on function public.totetrack_household_leave(uuid) to authenticated;
"""
call("POST", "/database/query", {"query": HOUSEHOLD_SQL})
print("household sharing functions: ready")
