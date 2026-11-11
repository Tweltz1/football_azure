-- Free trials are 15 days (set by hand in the old shared project; the new Talk Shops project started at the 30-day default).
-- Applies to shops that sign up from now on.
insert into public.talkshops_settings (id, trial_days) values (true, 15)
on conflict (id) do update set trial_days = 15;
