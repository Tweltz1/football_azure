alter table public.repair_shops add column if not exists rates jsonb not null default '[]';
alter table public.repair_jobs add column if not exists bill jsonb;
alter table public.repair_jobs add column if not exists bill_pdf text;
