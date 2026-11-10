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

-- Member card: when the account was made and how they sign in (shown as "Member since" and "Signed in with Apple").
alter table public.junk_members add column if not exists joined_at timestamptz;
alter table public.junk_members add column if not exists provider text;

-- Safer pickups: the street address and door go in a private spot only the poster, whoever is on the way, and
-- people the poster wrote back to can see. Porch (no-contact) pickup is the default.
alter table public.junk_items add column if not exists private_spot text not null default '';
alter table public.junk_items add column if not exists handoff text not null default 'porch';
