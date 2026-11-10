-- Curbsy public names: people pick the name neighbors see (Me tab), else their sign-in first name is used.
-- Before this, a sign-in with no name (often Sign in with Apple) showed the person's email address on listings,
-- messages and trips. Those are replaced with "Neighbor" here; each person's next action saves their new name.
alter table public.junk_members add column if not exists name text not null default '';

update public.junk_items set owner_name = 'Neighbor' where owner_name like '%@%';
update public.junk_messages set from_name = 'Neighbor' where from_name like '%@%';
update public.junk_claims set claimer_name = 'Neighbor' where claimer_name like '%@%';
