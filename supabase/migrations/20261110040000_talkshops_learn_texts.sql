-- Talk Shops: learning from real use (Tyler, 2026-11-10; on by default, a shop can turn it off).
-- Customer texts that staff answered, with names, contact details, numbers and addresses already removed by the
-- API (learnTexts.ts). No shop, job or customer id is stored. Rows older than 12 months are deleted on insert.
alter table public.repair_shops add column if not exists learn_off boolean not null default false;

create table if not exists public.talkshops_learn_texts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  text text not null check (length(text) between 1 and 300),
  topic text not null,          -- what the text sorter thought
  p real not null,              -- how sure it was
  outcome text not null check (outcome in ('used','edited','own')), -- staff sent the suggestion, edited it, or wrote their own
  label text                    -- set by hand when reviewing (status, hours, link, approval, review)
);
create index if not exists talkshops_learn_texts_created on public.talkshops_learn_texts (created_at);
alter table public.talkshops_learn_texts enable row level security;
revoke all on public.talkshops_learn_texts from public, anon, authenticated;

create or replace function public.talkshops_learn_add(p_text text, p_topic text, p_p real, p_outcome text) returns void
language plpgsql set search_path = public as $$
begin
  delete from talkshops_learn_texts where created_at < now() - interval '12 months';
  insert into talkshops_learn_texts(text, topic, p, outcome) values (left(p_text, 300), left(p_topic, 20), p_p, p_outcome);
end $$;
revoke all on function public.talkshops_learn_add(text, text, real, text) from public, anon, authenticated;
grant execute on function public.talkshops_learn_add(text, text, real, text) to service_role;
grant select, update on public.talkshops_learn_texts to service_role;
