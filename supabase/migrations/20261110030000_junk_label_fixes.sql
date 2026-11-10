-- Learning loop for the item recognition models (Curbsy and ToteTrack): when someone changes the name or
-- category the phone guessed, the guess and their fix are saved here. The small picture of just that item
-- (base64 JPEG, about 300 px) is kept only when they turned on "Help improve item recognition".
-- Only the API (service role) and the training workflow read or write this. Deleted with the account.
create table if not exists public.junk_label_fixes (
  id uuid primary key,
  user_id uuid not null,
  app text not null default 'curbsy',
  guess_label text not null default '',
  guess_title text not null default '',
  guess_source text not null default '',
  guess_confidence real,
  final_title text not null default '',
  final_category text not null default '',
  crop text,
  created_at timestamptz not null default now()
);
create index if not exists junk_label_fixes_created_idx on public.junk_label_fixes (created_at);
create index if not exists junk_label_fixes_user_idx on public.junk_label_fixes (user_id, created_at);
alter table public.junk_label_fixes enable row level security;
revoke all on public.junk_label_fixes from anon, authenticated;
