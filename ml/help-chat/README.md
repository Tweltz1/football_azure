# Help chat ("Ask Talk Shops")

A small trained model that answers staff questions about using Talk Shops from the Help page answers
(`talkshops/public/help-content.js`). It runs in the browser: no AI service, no cost per question.
Questions it couldn't answer well (offered choices, off topic, "Not what you asked?", and which choice was picked) are saved
scrubbed to `talkshops_help_misses` (route shop/help-miss; skipped when the shop turned off "Help improve Talk Shops";
12-month delete). Review them to add Help answers and questions to `data.mjs`.

- `data.mjs`: hand-written ways to ask each Help question (keys must match the Help questions exactly).
- `train.mjs`: trains two softmax regressions and writes `talkshops/public/help-chat-model.json` (about 750 KB, 310 KB gzipped):
  - gate: Talk Shops question, car repair question (sent to How-to), or off topic. Repair examples are the Mechanics
    Stack Exchange titles already shipped with How-to (CC BY-SA); off-topic examples are CLINC150 (CC BY 3.0).
  - picker: which Help answer fits.
- `eval.mjs [file]`: scores a test set. `heldout.json` was used while tuning; `heldout-fresh.json` was written afterwards
  and is the honest score (Nov 10 2026: right result first 82%, right answer among the offered choices 88%,
  wrong when it answered outright 4 of 63).
  Nov 11 2026: added `MORE2` (more ways to ask the 40 questions with the fewest examples or most mix-ups) and wrote
  `heldout-fresh-2.json` (73 questions, every Help topic) before training. Before -> after: fresh right first 81.1% ->
  85.3%, answered wrong 3 -> 2; fresh-2 right first 87.7% -> 86.3%, right answer in the offered choices 92.5% -> 94.0%,
  answered outright 52 -> 56 with 1 wrong both times. Don't train on fresh-2; write a new set for the next change.
- Runtime: `help-chat-features.js` (words), `help-chat-model-run.js` (scoring + thresholds), `help-chat.js` (the chat).

When you add or rename a Help question, add ways to ask it in `data.mjs` and run `node ml/help-chat/train.mjs`.
`node --test talkshops/tests/help-chat.test.mjs` fails until you do.
