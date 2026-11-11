-- Talk Shops archive: picked-up cars stay searchable for one year, then are deleted.
-- archived_at is when the car was picked up (null while it is still in the shop). The API sets it.
alter table public.repair_jobs add column if not exists archived_at timestamptz;
update public.repair_jobs set archived_at = updated_at where stage = 'picked_up' and archived_at is null;

-- Lowercase text the archive search matches against: RO, customer, phone digits, email, vehicle, plate, concern.
alter table public.repair_jobs add column if not exists search text generated always as (lower(
  coalesce(data->>'ro', '') || ' ' ||
  coalesce(data#>>'{customer,name}', '') || ' ' ||
  regexp_replace(coalesce(data#>>'{customer,phone}', ''), '\D', '', 'g') || ' ' ||
  coalesce(data#>>'{customer,email}', '') || ' ' ||
  coalesce(data#>>'{vehicle,year}', '') || ' ' || coalesce(data#>>'{vehicle,make}', '') || ' ' || coalesce(data#>>'{vehicle,model}', '') || ' ' ||
  coalesce(intake#>>'{vehicle,year}', '') || ' ' || coalesce(intake#>>'{vehicle,make}', '') || ' ' || coalesce(intake#>>'{vehicle,model}', '') || ' ' ||
  coalesce(data->>'plate', '') || ' ' || coalesce(intake->>'plate', '') || ' ' ||
  coalesce(data->>'concern', '') || ' ' || coalesce(intake->>'concern', '')
)) stored;

create index if not exists repair_jobs_archive_idx on public.repair_jobs (shop_id, archived_at desc) where stage = 'picked_up';

-- Deletes picked-up cars older than one year (the API also does this per shop when the archive opens).
create or replace function public.repair_purge_archive() returns integer
language sql set search_path = public as $$
  with gone as (delete from public.repair_jobs where stage = 'picked_up' and archived_at < now() - interval '1 year' returning 1)
  select count(*)::integer from gone;
$$;
revoke all on function public.repair_purge_archive() from public, anon, authenticated;
grant execute on function public.repair_purge_archive() to service_role;

-- Run it nightly when pg_cron is available on this project.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('talkshops-purge-archive', '17 9 * * *', 'select public.repair_purge_archive()');
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;
