# Help chat ("Ask Talk Shops")

A small trained model that answers staff questions about using Talk Shops from the Help page answers
(`talkshops/public/help-content.js`). It runs in the browser: no AI service, no cost per question, nothing sent or saved.

- `data.mjs`: hand-written ways to ask each Help question (keys must match the Help questions exactly).
- `train.mjs`: trains two softmax regressions and writes `talkshops/public/help-chat-model.json` (about 750 KB, 310 KB gzipped):
  - gate: Talk Shops question, car repair question (sent to How-to), or off topic. Repair examples are the Mechanics
    Stack Exchange titles already shipped with How-to (CC BY-SA); off-topic examples are CLINC150 (CC BY 3.0).
  - picker: which Help answer fits.
- `eval.mjs [file]`: scores a test set. `heldout.json` was used while tuning; `heldout-fresh.json` was written afterwards
  and is the honest score (Nov 10 2026: right result first 82%, right answer among the offered choices 88%,
  wrong when it answered outright 4 of 63).
- Runtime: `help-chat-features.js` (words), `help-chat-model-run.js` (scoring + thresholds), `help-chat.js` (the chat).

When you add or rename a Help question, add ways to ask it in `data.mjs` and run `node ml/help-chat/train.mjs`.
`node --test talkshops/tests/help-chat.test.mjs` fails until you do.
