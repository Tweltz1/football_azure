-- Talk Shops device limit, part 2 (2026-11-10): remember why a device was signed out, so its next request can say
-- why ("signed in on another device", "an owner signed you out", ...). Supabase rejects the ended sign-in before
-- the device check runs, so the reason is looked up by the token's session id. Kept 30 days.
create table if not exists public.talkshops_ended_sessions (
  session_id uuid primary key,
  user_id uuid not null,
  reason text not null check (reason in ('limit', 'idle', 'owner', 'others')),
  ended_at timestamptz not null default now()
);
alter table public.talkshops_ended_sessions enable row level security;
revoke all on public.talkshops_ended_sessions from public, anon, authenticated;
grant select on public.talkshops_ended_sessions to service_role;

create or replace function public.talkshops_claim_session(p_user uuid, p_session uuid, p_max int, p_idle_days int, p_agent text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_started timestamptz;
  v_last timestamptz;
  v_idle timestamptz := now() - make_interval(days => p_idle_days);
  v_out uuid[];
begin
  select coalesce(s.created_at, now()) into v_started from auth.sessions s where s.id = p_session and s.user_id = p_user;
  if not found then
    delete from public.talkshops_sessions where session_id = p_session;
    return 'ended';
  end if;
  select t.last_seen into v_last from public.talkshops_sessions t where t.session_id = p_session;
  if v_last is not null and v_last < v_idle then
    insert into public.talkshops_ended_sessions values (p_session, p_user, 'idle', now()) on conflict (session_id) do nothing;
    delete from auth.sessions where id = p_session;
    delete from public.talkshops_sessions where session_id = p_session;
    return 'idle';
  end if;
  if v_last is not null then
    -- Seen before: note the time at most once a minute (the Bay refreshes every 20 seconds).
    if v_last < now() - interval '1 minute' then
      update public.talkshops_sessions set last_seen = now() where session_id = p_session;
    end if;
    return 'ok';
  end if;
  -- A device this login hasn't used Talk Shops on yet. Serialize per user so two sign-ins at once both count.
  perform pg_advisory_xact_lock(hashtext('talkshops_sessions:' || p_user::text));
  delete from public.talkshops_ended_sessions where ended_at < now() - interval '30 days';
  -- Forget devices whose sign-in already ended some other way (Supabase sign-out or expiry), so they don't count.
  delete from public.talkshops_sessions t where t.user_id = p_user
    and not exists (select 1 from auth.sessions s where s.id = t.session_id);
  insert into public.talkshops_sessions (session_id, user_id, started_at, last_seen, user_agent)
    values (p_session, p_user, v_started, now(), left(p_agent, 300))
    on conflict (session_id) do update set last_seen = now();
  -- Sign out devices unused for too long, and every device past the newest p_max sign-ins.
  select array_agg(session_id) into v_out from (
    select session_id from public.talkshops_sessions where user_id = p_user and last_seen < v_idle
    union
    select session_id from (
      select session_id, row_number() over (order by started_at desc, last_seen desc) as n
      from public.talkshops_sessions where user_id = p_user and last_seen >= v_idle
    ) ranked where n > p_max
  ) gone;
  if v_out is not null then
    insert into public.talkshops_ended_sessions
      select t.session_id, p_user, case when t.last_seen < v_idle then 'idle' else 'limit' end, now()
      from public.talkshops_sessions t where t.session_id = any(v_out)
      on conflict (session_id) do nothing;
    delete from auth.sessions where id = any(v_out) and user_id = p_user;
    delete from public.talkshops_sessions where session_id = any(v_out);
    if p_session = any(v_out) then return 'ended'; end if;
  end if;
  return 'ok';
end $$;

create or replace function public.talkshops_end_sessions(p_user uuid, p_session uuid, p_keep uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_out uuid[];
begin
  select array_agg(session_id) into v_out from public.talkshops_sessions
    where user_id = p_user and (p_session is null or session_id = p_session) and (p_keep is null or session_id <> p_keep);
  if p_session is not null and (v_out is null or not p_session = any(v_out)) then
    -- Sign Out on a device that hasn't been tracked yet still ends that device.
    v_out := coalesce(v_out, '{}') || p_session;
  end if;
  if v_out is null then return 0; end if;
  if p_session is null then
    insert into public.talkshops_ended_sessions select unnest(v_out), p_user, case when p_keep is null then 'owner' else 'others' end, now()
      on conflict (session_id) do nothing;
  end if;
  delete from auth.sessions where id = any(v_out) and user_id = p_user;
  delete from public.talkshops_sessions where session_id = any(v_out);
  return coalesce(array_length(v_out, 1), 0);
end $$;

