-- Optional shop-wide Bay display preferences. Existing shops retain the default 1/3-day colors.
alter table public.repair_shops add column if not exists age_settings jsonb;
