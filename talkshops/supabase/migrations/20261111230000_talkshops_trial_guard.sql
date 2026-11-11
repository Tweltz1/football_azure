-- Free trial clean-up (2026-11-11):
-- 1. One trial per shop phone AND per sign-in email AND per account. talkshops_trial_phones keeps every key in its
--    "phone" column: the E.164 phone as before, plus "email:<address>" and "user:<account id>".
-- 2. trial_notice remembers which reminder email a trial shop got ("soon" 3 days before the end, "ended" after).
-- 3. Defaults match the 15-day trial (the API sets the real end date at sign-up from talkshops_settings).

comment on table public.talkshops_trial_phones is
  'One free trial per key. phone holds the shop phone (E.164), email:<normalized address> or user:<auth user id>.';

alter table public.repair_shops add column if not exists trial_notice text;
alter table public.repair_shops alter column trial_ends_at set default (now() + interval '15 days');
alter table public.talkshops_settings alter column trial_days set default 15;

-- Accounts that already have a shop count as having used their trial.
insert into public.talkshops_trial_phones (phone, shop_id)
select 'user:' || owner_id, id from public.repair_shops where owner_id is not null
on conflict (phone) do nothing;

-- So do the owners' sign-in emails (same normalizing as trialKeys in shopPlans.ts).
insert into public.talkshops_trial_phones (phone, shop_id)
select distinct on (k) k, shop_id from (
  select m.shop_id, m.added_at,
    'email:' || case when d in ('gmail.com', 'googlemail.com') then replace(l, '.', '') || '@gmail.com' else l || '@' || d end as k
  from (
    select shop_id, added_at, split_part(split_part(lower(email), '@', 1), '+', 1) as l, split_part(lower(email), '@', 2) as d
    from public.repair_shop_members where role = 'owner' and email like '%_@_%'
  ) m where l <> '' and d <> ''
) e
order by k, added_at
on conflict (phone) do nothing;

-- Shops whose trial already ended don't get a late "ended" email.
update public.repair_shops set trial_notice = 'ended' where plan = 'trial' and trial_ends_at < now() and trial_notice is null;
