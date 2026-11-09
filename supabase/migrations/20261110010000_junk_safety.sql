-- Curbsy safety (App Store guideline 1.2): who agreed to the Terms, who is banned, and messages sent to
-- Curbsy from the app's "Contact Curbsy" form. Only the API (service role) reads or writes these.
create table if not exists public.junk_members (
  user_id uuid primary key,
  terms_at timestamptz,
  banned_at timestamptz,
  ban_reason text not null default ''
);

create table if not exists public.junk_feedback (
  id uuid primary key,
  user_id uuid not null,
  user_name text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists junk_feedback_created_idx on public.junk_feedback (created_at);

alter table public.junk_members enable row level security;
alter table public.junk_feedback enable row level security;
revoke all on public.junk_members, public.junk_feedback from anon, authenticated;
