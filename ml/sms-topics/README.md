# Customer text sorter (Talk Shops Smart Replies)

A small trained model that sorts an incoming customer text into `status`, `hours`, `link`, `approval` or `review`.
It replaces most Gemini calls for Smart Replies and lets automatic answers cover everyday wording
("hey any update on the jeep?"), not just a few exact phrases.

- `data.mjs`: training texts. Shop texts are generated from hand-written patterns with typos, greetings and
  slang added. General "anything else" texts come from CLINC150 (Larson et al. 2019, CC BY 3.0, commercial use
  allowed with credit). **No shop or customer data is used, ever.**
- `train.mjs`: trains softmax regression on hashed words, word pairs and letter triples (AdaGrad), saves 8-bit
  weights to `supabase/functions/_shared/smsTopicWeights.ts` (~110 KB), then runs `eval.mjs`.
- `eval.mjs`: scores hand-written texts the model never trained on. `heldout.json` was used while adjusting the
  patterns; `heldout-fresh.json` was written afterwards and is the honest score. If you adjust patterns using
  the fresh set, write a new fresh set.
- Runtime: `supabase/functions/_shared/smsTopicModel.ts` (shared features code, `classifyText`, `autoTopic`).

Automatic replies need the model to be at least 90% sure, the text to be short and single-question, and none
of the words that need a person (safety, prices, a time, booking, complaints...). Approvals are never automatic.

Results on 2026-11-09, `heldout-fresh.json` (78 texts): sorted right 91%; automatic answers for 28 of 38
answerable texts (74%, the old exact phrases got 1); wrong automatic replies 0. Misses go to a person.

    node ml/sms-topics/train.mjs
    node --test supabase/tests/smsTopicModel.test.ts

## Learning from real use (since 2026-11-10)

Tyler chose: on by default, a shop can turn it off in Settings ("Help improve Talk Shops"; `repair_shops.learn_off`).
When staff answer a customer's text, the API (`supabase/functions/_shared/learnTexts.ts`) saves the customer text
with names, contact details, numbers and addresses removed, the sorter's guess, and whether staff sent the suggestion
as is (`used`), edited it, or wrote their own. No shop, job or customer id is stored. Rows older than 12 months are
deleted. Table: `talkshops_learn_texts` (service role only).

`retrain.mjs` runs monthly (`.github/workflows/sms-sorter-retrain.yml`): it uses rows staff `used` or that someone
labeled by hand (`label` column, set in the Supabase SQL editor), needs at least 100, retrains, and publishes only
if the fresh test texts score at least as well with zero wrong automatic replies. It prints counts, never texts:
this repo and its Actions logs are public, so real texts must never be committed or logged.
