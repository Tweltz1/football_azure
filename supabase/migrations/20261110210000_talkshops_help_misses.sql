-- Talk Shops: questions the Help chat ("Ask") couldn't answer well (Tyler, 2026-11-10: yes to saving them).
-- Same rules as talkshops_learn_texts: names, contact details, numbers and addresses removed by the API
-- (learnTexts.ts scrubText), no shop or person id, deleted after 12 months, off when the shop turns off
-- "Help improve Talk Shops". Used by hand to write new Help answers and training questions (ml/help-chat).
create table if not exists public.talkshops_help_misses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  text text not null check (length(text) between 1 and 300),
  kind text not null check (kind in ('unsure','other','notit','picked')), -- offered choices, off topic, "Not what you asked?", picked a choice
  guess text,      -- the chat's best Help question
  picked text      -- the Help question the person picked, when they picked one
);
create index if not exists talkshops_help_misses_created on public.talkshops_help_misses (created_at);
alter table public.talkshops_help_misses enable row level security;
revoke all on public.talkshops_help_misses from public, anon, authenticated;

create or replace function public.talkshops_help_miss_add(p_text text, p_kind text, p_guess text, p_picked text) returns void
language plpgsql set search_path = public as $$
begin
  delete from talkshops_help_misses where created_at < now() - interval '12 months';
  insert into talkshops_help_misses(text, kind, guess, picked) values (left(p_text, 300), p_kind, left(p_guess, 120), left(p_picked, 120));
end $$;
revoke all on function public.talkshops_help_miss_add(text, text, text, text) from public, anon, authenticated;
grant execute on function public.talkshops_help_miss_add(text, text, text, text) to service_role;
grant select on public.talkshops_help_misses to service_role;
