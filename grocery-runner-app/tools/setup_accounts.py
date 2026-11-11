"""Sets up Shop Stride accounts in the shared hobby Supabase project. Safe to re-run.

- grocery_saved_recipes: each person's own recipes, one row per person (only they can read or write it).
- grocery_community_recipes: recipes people share, readable by everyone; only the author can change or
  remove theirs. A small word filter rejects offensive titles and items, and a recipe is hidden once
  3 different people report it (grocery_recipe_reports).
- grocery_delete_account(): in-app account deletion (App Store guideline 5.1.1(v)).
- Sign-in: groceryrunner://auth as a return address (Google), the bundle ID as an Apple client ID, and
  a 6-digit code in the sign-in emails so email sign-in works inside the app.
Only ever adds to existing settings. Never prints the access token."""
import json
import os
import urllib.error
import urllib.request

TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = os.environ["SUPABASE_PROJECT_ID"]
API = f"https://api.supabase.com/v1/projects/{REF}"
REDIRECT = "groceryrunner://auth"
BUNDLE_ID = "com.tweltz1.groceryrunner"

# Words a shared recipe may not contain (whole words, any case). Kept short and obvious on purpose;
# reports catch the rest.
BLOCKED = ["fuck", "fucking", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "fag", "retard", "whore", "slut",
           "rape", "nazi", "kike", "spic", "chink", "tranny", "dick", "pussy", "cock", "porn", "kill yourself", "kys"]

SQL = """
create table if not exists public.grocery_saved_recipes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade primary key,
  data jsonb not null,
  updated_at bigint not null
);
alter table public.grocery_saved_recipes enable row level security;
drop policy if exists "grocery own recipes" on public.grocery_saved_recipes;
create policy "grocery own recipes" on public.grocery_saved_recipes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.grocery_saved_recipes to authenticated;

create table if not exists public.grocery_community_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author text not null check (char_length(author) between 1 and 40),
  title text not null check (char_length(title) between 2 and 80),
  category text not null check (category in ('breakfast', 'lunch', 'dinner', 'sides', 'snacks', 'desserts', 'drinks')),
  emoji text check (char_length(emoji) <= 8),
  minutes int check (minutes between 1 and 1440),
  servings text check (char_length(servings) <= 40),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60),
  saves int not null default 0,
  reports int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists grocery_community_recipes_recent on public.grocery_community_recipes (category, created_at desc);
alter table public.grocery_community_recipes enable row level security;
drop policy if exists "grocery community read" on public.grocery_community_recipes;
create policy "grocery community read" on public.grocery_community_recipes
  for select to anon, authenticated
  using (not hidden or user_id = (select auth.uid()));
drop policy if exists "grocery community add" on public.grocery_community_recipes;
create policy "grocery community add" on public.grocery_community_recipes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and not hidden and reports = 0 and saves = 0);
drop policy if exists "grocery community remove" on public.grocery_community_recipes;
create policy "grocery community remove" on public.grocery_community_recipes
  for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.grocery_community_recipes from anon, authenticated;
grant select on public.grocery_community_recipes to anon, authenticated;
grant insert (author, title, category, emoji, minutes, servings, items), delete on public.grocery_community_recipes to authenticated;

create table if not exists public.grocery_recipe_reports (
  recipe_id uuid not null references public.grocery_community_recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
alter table public.grocery_recipe_reports enable row level security;
drop policy if exists "grocery report" on public.grocery_recipe_reports;
create policy "grocery report" on public.grocery_recipe_reports
  for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke all on public.grocery_recipe_reports from anon, authenticated;
grant insert (recipe_id, reason) on public.grocery_recipe_reports to authenticated;

-- Count reports and hide a recipe once 3 different people report it.
create or replace function public.grocery_after_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.grocery_community_recipes
    set reports = reports + 1, hidden = hidden or reports + 1 >= 3
    where id = new.recipe_id;
  return new;
end;
$$;
drop trigger if exists grocery_after_report on public.grocery_recipe_reports;
create trigger grocery_after_report after insert on public.grocery_recipe_reports
  for each row execute function public.grocery_after_report();

-- Counts how many people saved a shared recipe (one call per save; the app calls it once).
create or replace function public.grocery_recipe_saved(recipe uuid) returns void
language sql security definer set search_path = '' as $$
  update public.grocery_community_recipes set saves = saves + 1 where id = recipe and not hidden;
$$;
revoke all on function public.grocery_recipe_saved(uuid) from public;
grant execute on function public.grocery_recipe_saved(uuid) to anon, authenticated;

-- Word filter on what gets shared.
create or replace function public.grocery_check_recipe() returns trigger
language plpgsql set search_path = '' as $$
declare
  body text := lower(new.title || ' ' || new.author || ' ' || coalesce(new.servings, '') || ' ' || new.items::text);
  w text;
begin
  foreach w in array %(blocked)s loop
    if body ~ ('(^|[^a-z])' || w || '([^a-z]|$)') then
      raise exception 'That recipe has words we don''t allow in shared recipes.' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists grocery_check_recipe on public.grocery_community_recipes;
create trigger grocery_check_recipe before insert on public.grocery_community_recipes
  for each row execute function public.grocery_check_recipe();

-- Deletes the person's Shop Stride data, then the sign-in itself unless another app's data still
-- belongs to it (the sign-in is shared with the other hobby apps). Returns 'account' or 'data'.
create or replace function public.grocery_delete_account() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r record;
  shared boolean := false;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from public.grocery_saved_recipes where user_id = uid;
  delete from public.grocery_recipe_reports where user_id = uid;
  delete from public.grocery_community_recipes where user_id = uid;
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_class k on k.oid = c.conrelid
    join pg_namespace n on n.oid = k.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and n.nspname not in ('auth', 'storage')
      and k.relname not like 'grocery\\_%%'
  loop
    execute format('select exists (select 1 from %%s where %%I = $1)', r.tbl, r.col) into shared using uid;
    exit when shared;
  end loop;
  if shared then
    return 'data';
  end if;
  delete from auth.users where id = uid;
  return 'account';
end;
$$;
revoke all on function public.grocery_delete_account() from public, anon;
grant execute on function public.grocery_delete_account() to authenticated;
""" % {"blocked": "array[" + ",".join("'" + w.replace("'", "''").replace(" ", "\\s+") + "'" for w in BLOCKED) + "]"}


def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json",
                                          "User-Agent": "grocery-runner-setup"})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Supabase {method} {path} returned {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")


call("POST", "/database/query", {"query": SQL})
print("Shop Stride account tables, community recipes and grocery_delete_account: ready")

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

# Email sign-in in the app uses a 6-digit code. New people get the "confirm signup" email and returning
# people the "magic link" email, so both need the code. Add it under the existing text, never replace it.
CODE_LINE = ('<p style="font-size:15px">Signing in on the Shop Stride app? Enter this code:</p>'
             '<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>')
for key in ("mailer_templates_confirmation_content", "mailer_templates_magic_link_content"):
    body = auth.get(key) or ""
    if "{{ .Token }}" not in body:
        if not body:
            body = '<h2>Your sign-in link</h2><p><a href="{{ .ConfirmationURL }}">Sign in</a></p>'
        patch[key] = body + CODE_LINE
print("Email sign-in code: " + ("adding" if any(k.startswith("mailer_") for k in patch) else "already in the emails"))
print("Email length " + str(auth.get("mailer_otp_length")) + ", expires after " + str(auth.get("mailer_otp_exp")) + "s")

if patch:
    call("PATCH", "/config/auth", patch)
    print("Auth settings updated: " + ", ".join(sorted(patch)))
else:
    print("Auth settings: already set")
