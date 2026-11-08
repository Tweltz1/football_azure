-- Reserve named seats when inviting or promoting. Serialize changes to a shop's roster.
create function public.repair_seat_guard() returns trigger language plpgsql set search_path=public as $$
declare s repair_shops; total_used int; owners_used int; max_staff int; max_owners int;
begin
  select * into strict s from repair_shops where id=new.shop_id for update;
  if tg_table_name='repair_shop_members' then
    if new.user_id=s.owner_id or (tg_op='UPDATE' and (new.role=old.role or new.role='tech')) then return new; end if;
  end if;
  max_staff:=case s.plan when 'starter' then 3 when 'pro' then 8 when 'trial' then 8 else 30 end;
  max_owners:=case s.plan when 'starter' then 2 when 'pro' then 3 when 'trial' then 3 else 30 end;
  select 1+count(*),1+count(*) filter(where role='owner') into total_used,owners_used
    from repair_shop_members where shop_id=s.id and user_id<>s.owner_id;
  select total_used+count(*),owners_used+count(*) filter(where role='owner') into total_used,owners_used
    from repair_shop_invites where shop_id=s.id and accepted_at is null and expires_at>now();
  if tg_op='INSERT' and total_used>=max_staff then raise exception 'All % staff seats are occupied or reserved.',max_staff; end if;
  if new.role='owner' and owners_used>=max_owners then raise exception 'All % owner seats are occupied or reserved.',max_owners; end if;
  return new;
end $$;
create trigger guard_staff_invite before insert on public.repair_shop_invites for each row execute function public.repair_seat_guard();
create trigger guard_staff_member before insert or update of role on public.repair_shop_members for each row execute function public.repair_seat_guard();

create function public.repair_accept_seat(p_shop text,p_id text,p_user uuid,p_email text,p_name text) returns boolean language plpgsql set search_path=public as $$
declare i repair_shop_invites;
begin
  perform 1 from repair_shops where id=p_shop for update;
  update repair_shop_invites set accepted_at=now() where id=p_id and shop_id=p_shop and lower(email)=lower(p_email) and accepted_at is null and expires_at>now() returning * into i;
  if not found then return false; end if;
  insert into repair_shop_members(user_id,shop_id,role,email,name) values(p_user,p_shop,i.role,p_email,coalesce(nullif(i.name,''),p_name));
  return true;
end $$;

create function public.repair_reserve_invite(p_inv jsonb) returns void language plpgsql set search_path=public as $$
declare i repair_shop_invites;
begin
  i:=jsonb_populate_record(null::repair_shop_invites,p_inv);
  perform 1 from repair_shops where id=i.shop_id for update;
  delete from repair_shop_invites where shop_id=i.shop_id and lower(email)=lower(i.email) and accepted_at is null;
  insert into repair_shop_invites select i.*;
end $$;
revoke all on function public.repair_accept_seat(text,text,uuid,text,text),public.repair_reserve_invite(jsonb) from public,anon,authenticated;
grant execute on function public.repair_accept_seat(text,text,uuid,text,text),public.repair_reserve_invite(jsonb) to service_role;

alter table public.repair_shops add column smart_topics text[] not null default '{}', add column smart_schedule jsonb not null default '{}';
alter table public.repair_jobs add column smart_paused boolean not null default false, add column sms_thread jsonb not null default '[]';
create index repair_sms_active_phone on public.repair_jobs ((data->'customer'->>'phone')) where archived_at is null and stage<>'picked_up';
create table public.repair_incoming_receipts (sid text primary key, received_at timestamptz not null default now());
alter table public.repair_incoming_receipts enable row level security;
revoke all on public.repair_incoming_receipts from public,anon,authenticated;

-- Separate sms_thread from data so a simultaneous staff edit cannot overwrite an incoming text.
create function public.repair_incoming_sms(p_sid text,p_phone text,p_body text,p_topic text,p_base text) returns text language plpgsql set search_path=public as $$
declare ids text[]; j repair_jobs; s repair_shops; stamp timestamptz:=now(); msg jsonb; draft text; auto_send boolean; cap int; period_key text; local_clock timestamp;
begin
  insert into repair_incoming_receipts(sid) values(p_sid) on conflict do nothing;
  if not found then return null; end if;
  select array_agg(id) into ids from (select id from repair_jobs where archived_at is null and stage<>'picked_up' and shop_id<>'demo-shop' and data->'customer'->>'phone'=p_phone limit 2) matches;
  if cardinality(ids) is distinct from 1 then return null; end if;
  select * into j from repair_jobs where id=ids[1] and archived_at is null and stage<>'picked_up' and data->'customer'->>'phone'=p_phone for update;
  if not found then return null; end if;
  select * into s from repair_shops where id=j.shop_id for update;
  -- Only route a reply after an outbound SMS linked this number to this job.
  if not exists(select from jsonb_array_elements(j.data->'messages') m where m->>'dir'='out' and coalesce(m->>'channel','sms')='sms' and m->>'delivery'='sent') then return null; end if;
  msg:=jsonb_build_object('dir','in','channel','sms','incomingSms',true,'t',stamp,'text',p_body);
  if s.plan='pro' and s.plan_status in ('active','trialing','past_due') or s.plan='trial' and s.trial_ends_at>stamp then
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
  update repair_jobs set sms_thread=sms_thread||jsonb_build_array(msg)||case when auto_send then jsonb_build_array(jsonb_build_object('dir','out','channel','sms','autoReply',true,'t',stamp+interval '1 millisecond','text',draft)) else '[]'::jsonb end where id=j.id;
  return case when auto_send then draft end;
end $$;
revoke all on function public.repair_incoming_sms(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.repair_incoming_sms(text,text,text,text,text) to service_role;
grant select,insert,delete on public.repair_incoming_receipts to service_role;
grant execute on function public.repair_use_texts(text,integer,text,integer) to service_role;
