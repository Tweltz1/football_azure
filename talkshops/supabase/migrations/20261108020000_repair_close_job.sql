-- Talk Shops: a repair can be closed without being finished (customer declined, never came in).
-- Closed cars get archived_at like picked-up ones, so the archive and the one-year purge now key on archived_at alone.
create index if not exists repair_jobs_archived_idx on public.repair_jobs (shop_id, archived_at desc) where archived_at is not null;

create or replace function public.repair_purge_archive() returns integer
language sql set search_path = public as $$
  with gone as (delete from public.repair_jobs where archived_at < now() - interval '1 year' returning 1)
  select count(*)::integer from gone;
$$;
revoke all on function public.repair_purge_archive() from public, anon, authenticated;
grant execute on function public.repair_purge_archive() to service_role;
