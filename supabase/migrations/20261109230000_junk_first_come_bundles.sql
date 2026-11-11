-- Curbsy "First come, first served" listings: "I'm on my way" doesn't hold the item, so several people
-- can be on the way at once. Normal listings still allow one open claim at a time.
alter table public.junk_items add column if not exists first_come boolean not null default false;
alter table public.junk_claims add column if not exists shared boolean not null default false;
drop index if exists public.junk_claims_open_item_idx;
create unique index if not exists junk_claims_open_item_idx on public.junk_claims (item_id)
  where status in ('active', 'arrived') and not shared;

-- Multi-item posts: one listing can hold several things ("pieces"), each with its own title, category
-- and taken flag. A claim names the pieces it's for (empty means the whole listing).
alter table public.junk_items add column if not exists pieces jsonb not null default '[]'::jsonb;
alter table public.junk_claims add column if not exists piece_ids text[] not null default '{}';

-- Same search as before, but a category also matches any piece still up for grabs in a multi-item post.
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
    and (p_category is null or i.category = p_category or exists (
      select 1 from jsonb_array_elements(i.pieces) p
      where p->>'category' = p_category and coalesce((p->>'gone')::boolean, false) = false))
    and not exists (select 1 from unnest(coalesce(p_words, '{}')) w where position(w in i.search_text) = 0)
  order by (i.status = 'pending'),
    case when p_sort = 'new' then i.created_at end desc nulls last,
    d.km
  limit greatest(1, least(p_limit, 200));
$$;
revoke all on function public.junk_search from anon, authenticated;
