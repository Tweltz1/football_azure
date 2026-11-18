-- Curbsy stars: after a finished pickup ("Got it" at the spot) each side can rate the other once, 1 to 5 stars.
-- stars = 0 means they skipped it (not counted). Only the API (service role key) touches this table.
create table if not exists public.junk_reviews (
  id uuid primary key,
  claim_id uuid not null,
  item_id uuid not null,
  reviewer_id uuid not null,
  subject_id uuid not null,
  stars smallint not null check (stars between 0 and 5),
  created_at timestamptz not null default now(),
  unique (claim_id, reviewer_id)
);
create index if not exists junk_reviews_subject_idx on public.junk_reviews (subject_id) where stars > 0;
create index if not exists junk_reviews_reviewer_idx on public.junk_reviews (reviewer_id);
alter table public.junk_reviews enable row level security;
revoke all on public.junk_reviews from anon, authenticated;
