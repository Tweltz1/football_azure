-- Junk App: free stuff people are giving away, with photos, messages, reports and blocks.
-- Only the API (service role key) touches these tables; photos live in the public junk-photos bucket.

create table if not exists public.junk_items (
  id uuid primary key,
  owner_id uuid not null,
  owner_name text not null default '',
  title text not null,
  description text not null default '',
  category text not null default 'other',
  tags text[] not null default '{}',
  condition text not null default 'good',
  pickup text not null default '',
  photos text[] not null default '{}',
  lat double precision not null,
  lng double precision not null,
  status text not null default 'available',
  ai_detected boolean not null default false,
  reports integer not null default 0,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists junk_items_place_idx on public.junk_items (lat, lng) where status in ('available', 'pending');
create index if not exists junk_items_owner_idx on public.junk_items (owner_id, updated_at desc);

create table if not exists public.junk_messages (
  id uuid primary key,
  item_id uuid not null,
  from_id uuid not null,
  to_id uuid not null,
  from_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists junk_messages_to_idx on public.junk_messages (to_id, created_at desc);
create index if not exists junk_messages_from_idx on public.junk_messages (from_id, created_at desc);

create table if not exists public.junk_reports (
  id uuid primary key,
  item_id uuid not null,
  reporter_id uuid not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (item_id, reporter_id)
);

create table if not exists public.junk_blocks (
  user_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);

create table if not exists public.junk_uploads (
  user_id uuid not null,
  path text primary key,
  created_at timestamptz not null default now()
);
create index if not exists junk_uploads_user_idx on public.junk_uploads (user_id, created_at desc);

alter table public.junk_items enable row level security;
alter table public.junk_messages enable row level security;
alter table public.junk_reports enable row level security;
alter table public.junk_blocks enable row level security;
alter table public.junk_uploads enable row level security;
revoke all on public.junk_items, public.junk_messages, public.junk_reports, public.junk_blocks, public.junk_uploads from anon, authenticated;

-- Nearby search: items within p_km of a point, every word in p_words somewhere in the search text.
-- The API strips wildcard characters from the words before calling this.
create or replace function public.junk_search(
  p_lat double precision, p_lng double precision, p_km double precision, p_words text[],
  p_category text, p_sort text, p_since timestamptz, p_limit integer
) returns table (item jsonb, km double precision)
language sql stable
set search_path = public
as $$
  select to_jsonb(i) as item, d.km
  from public.junk_items i
  cross join lateral (
    select 6371 * 2 * asin(least(1, sqrt(
      power(sin(radians(i.lat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(i.lat)) * power(sin(radians(i.lng - p_lng) / 2), 2)
    ))) as km
  ) d
  where i.status in ('available', 'pending')
    and i.updated_at >= p_since
    and i.lat between p_lat - p_km / 111.0 and p_lat + p_km / 111.0
    and d.km <= p_km
    and (p_category is null or i.category = p_category)
    and not exists (select 1 from unnest(coalesce(p_words, '{}')) w where position(w in i.search_text) = 0)
  order by (i.status = 'pending'),
    case when p_sort = 'new' then i.created_at end desc nulls last,
    d.km
  limit greatest(1, least(p_limit, 200));
$$;
revoke all on function public.junk_search from anon, authenticated;

-- Public photo bucket: JPEGs up to 3 MB. Only the API uploads (no insert policy for users).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('junk-photos', 'junk-photos', true, 3145728, array['image/jpeg'])
on conflict (id) do nothing;
