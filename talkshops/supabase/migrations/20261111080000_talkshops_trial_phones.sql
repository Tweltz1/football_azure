-- One free trial per shop phone: a new shop whose phone already had a trial starts with it ended.
-- Phones are E.164 (+15550142290). Kept even if the shop changes its phone later.
create table if not exists public.talkshops_trial_phones (
  phone text primary key,
  shop_id text not null,
  created_at timestamptz not null default now()
);
alter table public.talkshops_trial_phones enable row level security;

-- Shops that already exist count as having used their phone's trial.
insert into public.talkshops_trial_phones (phone, shop_id)
select distinct on (p) p, id from (
  select id, created_at,
    case
      when length(regexp_replace(phone, '\D', '', 'g')) = 10 then '+1' || regexp_replace(phone, '\D', '', 'g')
      when length(regexp_replace(phone, '\D', '', 'g')) = 11 and regexp_replace(phone, '\D', '', 'g') like '1%' then '+' || regexp_replace(phone, '\D', '', 'g')
    end as p
  from public.repair_shops
) s where p is not null
order by p, created_at
on conflict (phone) do nothing;
