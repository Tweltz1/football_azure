# Item namer

Names each thing the phone finds in a photo (Curbsy and ToteTrack). A Create ML image classifier trained on
GitHub's macOS runners by `.github/workflows/item-namer.yml`, published as release `item-namer-vN`
(`ItemNamer.mlmodel`, `labels.json`, `metrics.json`, `fixes.json`).

- `prepare.py`: crops of everyday made things from LVIS v1 (CC BY 4.0), picked with WordNet.
- `fixes.py`: the learning loop. Adds the name fixes people sent from the apps (`junk_label_fixes` in
  Supabase; a picture only from people who turned on "Help improve item recognition") and reports the most
  common mix-ups in `fixes.json`.
- `train.swift`: trains and writes the model and its test accuracy.

Retrain: run the workflow from the Actions tab (set `version` to publish), or change `run.json` and push.
