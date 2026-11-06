-- Shred the Summit changed from distance scoring to footballs and landings on 2026-10-18 (PR #94, live
-- 14:47 UTC). Tyler asked to clear the scores set under the old rules; newer ones stay.
delete from public.game_scores where game = 'shred' and at < '2026-10-18T14:47:45Z';
