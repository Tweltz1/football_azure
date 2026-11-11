-- Talk Shops workday upgrades: scheduled reminder texts and quick-service packages.
-- follow_up_at is the earliest reminder still waiting for a repair (the API keeps it in step with data.followups).
alter table public.repair_jobs add column if not exists follow_up_at timestamptz;
create index if not exists repair_jobs_follow_up_idx on public.repair_jobs (shop_id, follow_up_at) where follow_up_at is not null;

-- Quick services: [{ id, name, lines: [charge], fastLane }]
alter table public.repair_shops add column if not exists packages jsonb;
