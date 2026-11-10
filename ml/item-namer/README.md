# Item namer

Names each thing the phone finds in a photo (Curbsy and ToteTrack). The phone takes Apple Vision's feature
print (revision 2, iOS 17+) of each part of the photo and multiplies it by our weights. Trained on GitHub's
macOS runners by `.github/workflows/item-namer.yml`, published as release `item-namer-vN` (`namer.f32`:
float32 (dims + 1) x kinds with the bias as the last row, input L2-normalized; `labels.json` in column
order; `metrics.json`).

Create ML's own image classifier crashed twice on this data (a 0x0 picture error after 1.5 to 2.5 hours),
so the feature prints are made one picture at a time and unreadable ones are skipped.

- `prepare.py`: crops of everyday made things from LVIS v1 (CC BY 4.0), picked with WordNet, plus Open Images V7 (boxes CC BY 4.0, photos CC BY 2.0) for common curb finds LVIS has few or none of (`OPEN_IMAGES`). `SPLIT` keeps curb finds like mattresses and dressers apart from the broader kinds the hand-made list merges them into.
- `fixes.py`: the learning loop. Adds the name fixes people sent from the apps (`junk_label_fixes` in
  Supabase; a picture only from people who turned on "Help improve item recognition") and reports the most
  common mix-ups in `fixes.json`.
- `features.swift`: Apple Vision feature print for every crop.
- `fit.py`: softmax classifier on those (numpy), with test accuracy.

Retrain: run the workflow from the Actions tab (set `version` to publish), or change `run.json` and push.
