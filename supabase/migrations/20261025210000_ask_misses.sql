-- Questions the Start/Sit chat bar couldn't answer, so new rules can be written for them.
-- Only the question text is kept (no account details).

create table if not exists public.ask_misses (
  id bigint generated always as identity primary key,
  question text not null,
  created_at timestamptz not null default now()
);

-- Only the API (which uses the service role key) may touch this table.
alter table public.ask_misses enable row level security;
revoke all on public.ask_misses from anon, authenticated;
