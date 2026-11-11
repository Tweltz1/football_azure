-- Talk Shops' own Supabase project: turn on pg_cron so the daily archive purge (repair_archive) can be scheduled.
-- In the shared hood-league project this was turned on in the dashboard; here the first migration does it.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not enabled: %', sqlerrm;
end $$;
