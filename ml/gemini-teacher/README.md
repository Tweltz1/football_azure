# Gemini teacher

Gemini can't run on the phones (the apps name things on the phone, for free), but it can teach the on-phone
namers. `teach.py` takes Open Images V7 boxes that people only labeled with a broad kind ("Furniture", "Tool",
"Toy", "Kitchenware"), asks Gemini what each one is exactly ("Step stool", "Hand saw", "Toy truck"), and keeps
the photos it's sure of. Ten photos per request; about 150 requests a run, so the set grows run by run within
the free key's daily limit.

- Runs from `.github/workflows/gemini-teacher.yml`: on its own (Actions tab, or a push here to the live
  branch), and first thing in every item namer training (`item-namer.yml`, weekly).
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
