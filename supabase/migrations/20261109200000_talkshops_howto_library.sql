-- Talk Shops how-to library: AI answers saved by vehicle and question, so repeat questions are answered
-- without a new AI call, rated by shops ("this worked" / "not right"), with tips techs add.
create table if not exists public.howto_answers (
  id uuid primary key default gen_random_uuid(),
  shop_id text,                       -- the shop that first asked (answers may be shared; see shopHowTo.ts)
  make_model text not null,           -- normalized "make|model"
  year int,
  engine text not null default '',    -- normalized engine, '' when not given
  q_key text not null,                -- normalized question words, sorted
  question text not null,             -- the question as first asked
  vehicle text not null default '',
  answer jsonb not null,
  ratings jsonb not null default '{}'::jsonb,  -- shop id -> true (worked) / false (not right)
  uses int not null default 1,
  retired boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists howto_answers_lookup on public.howto_answers (make_model, q_key);
create index if not exists howto_answers_vehicle on public.howto_answers (make_model, created_at desc);

create table if not exists public.howto_tips (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.howto_answers(id) on delete cascade,
  shop_id text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists howto_tips_answer on public.howto_tips (answer_id);

-- Only the API (service role) reads and writes these.
alter table public.howto_answers enable row level security;
alter table public.howto_tips enable row level security;
