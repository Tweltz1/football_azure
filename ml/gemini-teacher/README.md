# Gemini teacher

Gemini can't run on the phones (the apps name things on the phone, for free), but it can teach the on-phone
namers. `teach.py` takes Open Images V7 boxes that people only labeled with a broad kind ("Furniture", "Tool",
"Toy", "Kitchenware"), asks Gemini what each one is exactly ("Step stool", "Hand saw", "Toy truck"), and keeps
the photos it's sure of. Twenty photos per request on Flash-Lite, 300 requests a day (about 6,000 photos, ~$0.40),
so all ~35,000 are named in about a week for ~$2-3; after that the daily run finds nothing left to ask. It uses its own key (GitHub secret `GEMINI_TRAINING_KEY`), never the live apps' one.

- Runs from `.github/workflows/gemini-teacher.yml`: every day (started by `item-namer-weekly.yml` on main),
  by hand, on a push here to the live branch (`run.json` budget), and first thing in every item namer training.
- The set lives in the release `gemini-teacher` as `teacher.zip`: `asked.json` (every box asked, sure or not,
  so none is asked twice) and `crops/<id>.jpg` (the sure ones, 299 px).
- `names.txt`: names Gemini should prefer (ToteTrack's item list), so its answers line up with the namers.

Who learns from it:
- Curbsy's item namer: `ml/item-namer/teacher.py` adds the photos to training (new kinds once 20 photos agree).
  Phones only switch when `promote.py` finds the new namer at least as good on photos people labeled.
- ToteTrack's namer (`totetrack-app/tools/namer/build_namer.py --teacher`): trains with and without them and
  keeps them only when the test score (photos people labeled) is at least as good.

Gemini's photos are training only, never test photos, so neither namer is graded by Gemini. Curbsy's own users'
photos are not used here: only the item pictures people chose to share (see `ml/item-namer/fixes.py`).
