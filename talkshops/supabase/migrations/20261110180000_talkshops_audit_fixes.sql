-- Talk Shops audit fixes (2026-11-10).
--
-- 1. Customer texts are no longer dropped when the customer has two cars in, has cars at two shops (every shop
--    shares one number), or answers after pickup ("How did we do?"). A reply now goes to the repair that most
--    recently texted that number, if that text went out in the last 30 days. Cars picked up or closed in the
--    last 30 days count. Smart Replies still only answer for cars that are in the shop.
-- 2. The How-to assistant's hourly limit is counted in the database, so it holds across server copies.

create or replace function public.repair_incoming_sms(p_sid text,p_phone text,p_body text,p_topic text,p_base text) returns text language plpgsql set search_path=public as $$
declare jid text; j repair_jobs; s repair_shops; stamp timestamptz:=now(); msg jsonb; draft text; auto_send boolean:=false; cap int; period_key text; local_clock timestamp; active boolean;
begin
  insert into repair_incoming_receipts(sid) values(p_sid) on conflict do nothing;
  if not found then return null; end if;
  -- The repair that texted this number most recently (a sent SMS in the last 30 days).
  select x.id into jid from (
    select r.id, (select max((m->>'t')::timestamptz) from jsonb_array_elements(r.data->'messages') m
                  where m->>'dir'='out' and coalesce(m->>'channel','sms')='sms' and m->>'delivery'='sent') last_out
    from repair_jobs r
    where r.shop_id<>'demo-shop' and r.data->'customer'->>'phone'=p_phone
      and (r.archived_at is null or r.archived_at>stamp-interval '30 days')
  ) x where x.last_out>stamp-interval '30 days' order by x.last_out desc limit 1;
  if jid is null then return null; end if;
  select * into j from repair_jobs where id=jid for update;
  if not found then return null; end if;
  select * into s from repair_shops where id=j.shop_id for update;
  active:=j.archived_at is null and j.stage<>'picked_up';
  msg:=jsonb_build_object('dir','in','channel','sms','incomingSms',true,'t',stamp,'text',p_body);
  if active and (s.plan='pro' and s.plan_status in ('active','trialing','past_due') or s.plan='trial' and s.trial_ends_at>stamp) then
    if p_topic='hours' and nullif(trim(s.hours),'') is not null then draft:=s.name||' • Our posted shop hours are '||s.hours||'.';
    elsif p_topic='link' and jsonb_array_length(coalesce(j.data->'estimate','[]'))>0 then draft:=s.name||' • You can review your estimate here: '||p_base||j.token;
    elsif p_topic='status' then
      draft:=case j.stage when 'checked_in' then 'Your vehicle is checked in.' when 'diagnosing' then 'Your vehicle is in diagnosis.' when 'parts' then 'We are waiting on parts.' when 'in_progress' then 'Work on your vehicle is in progress.' when 'qc' then 'Your vehicle is in quality check.' when 'ready' then 'Your vehicle is marked ready for pickup.' when 'approval' then 'You can see the current estimate on your repair page.' end;
      if draft is not null then draft:=s.name||' • '||draft||' '||p_base||j.token; end if;
    end if;
    if draft is not null and nullif(trim(s.smart_schedule->>'signature'),'') is not null then draft:=draft||' — '||left(s.smart_schedule->>'signature',60); end if;
    if draft is not null then msg:=msg||jsonb_build_object('suggestion',draft); end if;
    auto_send:=draft is not null and p_topic=any(s.smart_topics) and not j.smart_paused and j.data->'customer'->>'consent'='true' and coalesce(j.data->'customer'->>'preference','sms') in ('both','sms');
    if auto_send and s.smart_schedule->>'afterHours'='true' then
      local_clock:=stamp at time zone (s.smart_schedule->>'zone');
      auto_send:=not (s.smart_schedule->'days' @> to_jsonb(array[extract(isodow from local_clock)::int]) and to_char(local_clock,'HH24:MI')>=s.smart_schedule->>'open' and to_char(local_clock,'HH24:MI')<s.smart_schedule->>'close');
    end if;
    if auto_send then
      -- At most one automatic answer per job in five minutes, including webhook retries with different SIDs.
      auto_send:=not exists(select from jsonb_array_elements(j.sms_thread) m where m->>'autoReply'='true' and (m->>'t')::timestamptz>stamp-interval '5 minutes');
    end if;
    if auto_send then
      cap:=3000; period_key:=to_char(stamp at time zone 'UTC','YYYY-MM');
      if s.plan='trial' then select trial_texts into cap from talkshops_settings where id=true; cap:=coalesce(cap,150);period_key:='trial'; end if;
      auto_send:=repair_use_texts(s.id,1,period_key,cap);
    end if;
  end if;
  -- A reply on a finished repair still shows as new: updated_at moves so the Bay lists it again for 2 days.
  update repair_jobs set sms_thread=sms_thread||jsonb_build_array(msg)||case when auto_send then jsonb_build_array(jsonb_build_object('dir','out','channel','sms','autoReply',true,'t',stamp+interval '1 millisecond','text',draft)) else '[]'::jsonb end,
    updated_at=case when active then updated_at else stamp end
  where id=j.id;
  return case when auto_send then draft end;
end $$;
revoke all on function public.repair_incoming_sms(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.repair_incoming_sms(text,text,text,text,text) to service_role;

create index if not exists repair_jobs_customer_phone on public.repair_jobs ((data->'customer'->>'phone'));

-- How-to questions per shop per hour.
create table if not exists public.talkshops_howto_usage (
  shop_id text not null,
  hour text not null,
  n int not null default 0,
  primary key (shop_id, hour)
);
alter table public.talkshops_howto_usage enable row level security;
revoke all on public.talkshops_howto_usage from public, anon, authenticated;

create or replace function public.talkshops_howto_claim(p_shop text, p_hour text, p_limit int) returns boolean language plpgsql set search_path=public as $$
declare used int;
begin
  delete from talkshops_howto_usage where hour < to_char((now() at time zone 'UTC') - interval '2 days', 'YYYY-MM-DD"T"HH24');
  insert into talkshops_howto_usage(shop_id, hour, n) values (p_shop, p_hour, 1)
    on conflict (shop_id, hour) do update set n = talkshops_howto_usage.n + 1 where talkshops_howto_usage.n < p_limit
    returning n into used;
  return used is not null;
end $$;
revoke all on function public.talkshops_howto_claim(text,text,int) from public,anon,authenticated;
grant execute on function public.talkshops_howto_claim(text,text,int) to service_role;
grant select, insert, update, delete on public.talkshops_howto_usage to service_role;
