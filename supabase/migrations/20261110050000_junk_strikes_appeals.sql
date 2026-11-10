-- Curbsy "two strikes": a listing the daily review confirms as breaking the rules is a strike; the second
-- strike bans the account. Banned or warned people (and owners of hidden listings) can appeal from the app.
alter table public.junk_members add column if not exists strikes integer not null default 0;
alter table public.junk_members add column if not exists last_strike_at timestamptz;
alter table public.junk_feedback add column if not exists kind text not null default 'contact';
alter table public.junk_feedback add column if not exists item_id uuid;
alter table public.junk_items add column if not exists strike boolean not null default false;
