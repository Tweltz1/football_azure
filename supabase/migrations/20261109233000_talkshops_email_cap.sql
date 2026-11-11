-- Talk Shops: a daily cap on customer emails per shop (texts already have a plan allowance), so a free
-- signup can't use talkshops.app to send bulk email. Counted in one row-locked step, like repair_use_texts.
alter table public.repair_shops
  add column if not exists emails_used integer not null default 0,
  add column if not exists emails_day text not null default '';

create or replace function public.repair_use_emails(p_shop text, p_day text, p_limit integer) returns boolean
language sql set search_path = public as $$
  with up as (
    update public.repair_shops
       set emails_used = (case when emails_day = p_day then emails_used else 0 end) + 1,
           emails_day = p_day
     where id = p_shop
       and (case when emails_day = p_day then emails_used else 0 end) + 1 <= p_limit
    returning 1
  )
  select exists (select 1 from up);
$$;
revoke all on function public.repair_use_emails(text, text, integer) from public, anon, authenticated;
grant execute on function public.repair_use_emails(text, text, integer) to service_role;
