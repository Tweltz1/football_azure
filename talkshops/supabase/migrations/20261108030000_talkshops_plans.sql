-- Talk Shops plans: a free trial, then a paid plan through Stripe (see supabase/functions/_shared/shopPlans.ts).
-- Shops that existed before this keep plan = null, which means no limits.
alter table public.repair_shops
  add column if not exists plan text,
  add column if not exists plan_status text not null default '',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists plan_interval text,
  add column if not exists period_end timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists texts_used integer not null default 0,
  add column if not exists texts_period text not null default '';
-- New shops start on the trial (the API then sets the end date from talkshops_settings).
alter table public.repair_shops alter column plan set default 'trial';
alter table public.repair_shops alter column plan_status set default 'trialing';
alter table public.repair_shops alter column trial_ends_at set default (now() + interval '30 days');
create index if not exists repair_shops_stripe_customer_idx on public.repair_shops (stripe_customer_id);

-- Trial rules. Change them in Supabase: Table Editor -> talkshops_settings (one row).
-- trial_days must be 15 or 30. Changes apply to shops that sign up afterwards.
create table if not exists public.talkshops_settings (
  id boolean primary key default true check (id),
  trial_days integer not null default 30 check (trial_days in (15, 30)),
  trial_texts integer not null default 150 check (trial_texts >= 0),
  trial_cars integer not null default 25 check (trial_cars >= 0)
);
insert into public.talkshops_settings (id) values (true) on conflict (id) do nothing;
alter table public.talkshops_settings enable row level security;
revoke all on public.talkshops_settings from anon, authenticated;

-- Counts texts against a shop's allowance in one step, so two texts at once can't both slip past the limit.
-- A new period (the next month, or the trial) starts the count at zero. Returns false, counting nothing, when over.
create or replace function public.repair_use_texts(p_shop text, p_n integer, p_period text, p_limit integer) returns boolean
language sql as $$
  with up as (
    update public.repair_shops
       set texts_used = (case when texts_period = p_period then texts_used else 0 end) + p_n,
           texts_period = p_period
     where id = p_shop
       and (p_limit is null or (case when texts_period = p_period then texts_used else 0 end) + p_n <= p_limit)
    returning 1
  )
  select exists (select 1 from up);
$$;
revoke all on function public.repair_use_texts(text, integer, text, integer) from anon, authenticated, public;
