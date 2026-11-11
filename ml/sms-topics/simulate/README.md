# Learning-loop simulation (offline)

Runs the same scrub + learn code the live app uses on made-up customer texts and simulated staff, so the weekly
retrain can be tried without putting fake rows into the real database.

    node ml/sms-topics/simulate/sim.mjs 3000 0      # 3000 texts, staff use only; 3000 300 = also 300 hand labels
    node ml/sms-topics/simulate/score.mjs           # score the current model on 1000 new simulated texts
    LEARN_ROWS=/tmp/talkshops-sim-rows.json node ml/sms-topics/train.mjs && node ml/sms-topics/simulate/score.mjs
    git checkout supabase/functions/_shared/smsTopicWeights.ts   # put the real model back

Result 2026-11-10 (3000 texts): before 34% auto-answered; staff use only 57% (hand-written test unchanged at 91%);
with 300 hand labels 87% on simulated texts but the hand-written test fell to 88.5%, so the weekly gate would have
refused it (it learned the simulator's phrasing, not better general sorting).
