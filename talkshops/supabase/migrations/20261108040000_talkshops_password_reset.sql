-- Talk Shops "Forgot password": 6-digit codes sent by email or to a verified phone (see
-- supabase/functions/_shared/shopAccount.ts). Only the API (service role) reads or writes these.

-- A phone each shop account can verify in Shop settings, so reset codes can go by text.
create table if not exists public.talkshops_recovery_phones (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text not null,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Codes are stored as SHA-256 hashes. purpose: 'reset' (new password) or 'phone' (verify a phone).
create table if not exists public.talkshops_auth_codes (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('reset', 'phone')),
  channel text not null check (channel in ('email', 'sms')),
  target text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists talkshops_auth_codes_user_idx on public.talkshops_auth_codes (user_id, purpose, created_at desc);

alter table public.talkshops_recovery_phones enable row level security;
alter table public.talkshops_auth_codes enable row level security;
revoke all on public.talkshops_recovery_phones from anon, authenticated;
revoke all on public.talkshops_auth_codes from anon, authenticated;

-- Finds a sign-in account by email for the reset flow (the admin API has no lookup by email).
create or replace function public.talkshops_user_by_email(p_email text)
returns table (id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text from auth.users u where lower(u.email) = lower(p_email) and u.deleted_at is null limit 1
$$;
revoke all on function public.talkshops_user_by_email(text) from public, anon, authenticated;
grant execute on function public.talkshops_user_by_email(text) to service_role;
