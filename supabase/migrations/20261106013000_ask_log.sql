-- Start/Sit chat log: every question, the site's own model answer, and Gemini's reply (null when it failed).
-- Used to reuse a reply while Gemini is down and to grow the free rule-based model from real questions.
create table if not exists public.ask_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id text,
  week int,
  question text not null,
  match_key text not null,
  model_kind text,
  model_text text,
  model_answer jsonb,
  ai_answer text,
  ideas jsonb not null default '[]'::jsonb,
  source text not null default 'gemini'
);
create index if not exists ask_log_match_idx on public.ask_log (match_key, created_at desc) where source = 'gemini';
create index if not exists ask_log_created_idx on public.ask_log (created_at desc);

-- Only the API (which uses the service role key) may touch this table.
alter table public.ask_log enable row level security;
revoke all on public.ask_log from anon, authenticated;
