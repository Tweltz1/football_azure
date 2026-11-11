# Household-item detector (Curbsy and ToteTrack)

One on-device object detector shared by both iPhone apps. It finds each thing in a photo (tape measure,
batteries, drill, lamp, chair, storage bin, …) so a photo of a pile or a tote becomes separate items.

- `classes.json`: the kinds of things it learns, each with the title and category the apps show and the
  matching names in the training sets.
- `prepare.py`: downloads photos with boxes for those classes from LVIS v1 and Open Images (both CC BY)
  into Create ML's format.
- `train.swift`: trains with Apple's Create ML (transfer learning) and writes `HouseholdDetector.mlmodel`.
- `.github/workflows/household-detector.yml`: runs both on GitHub's macOS runners (free for this public
  repo) and, when asked, publishes the model as a GitHub release `household-detector-vN` with
  `HouseholdDetector.mlmodel` and `labels.json` (`label`, `title`, `category`, `item`).

Create ML is Apple's own tool, so unlike the Ultralytics YOLO toolkit (AGPL) there are no licence strings
on shipping the model in App Store apps. Credit for the training data goes in each app's acknowledgements:
LVIS (CC BY 4.0) and Open Images (CC BY 4.0 annotations, CC BY 2.0 photos).

## Item namer (`ml/item-namer`)

To cover hundreds of kinds of things, naming is split from finding. The phone finds each thing (Apple's
region finder, plus this detector), then the item namer, a Create ML image classifier trained on LVIS
crops, names each crop. Every LVIS category that WordNet files as a made object people give away
(no food, animals, people, buildings or cars) and that has enough examples is included, about 400-500.
The workflow `.github/workflows/item-namer.yml` publishes release `item-namer-vN` with
`ItemNamer.mlmodel` and `labels.json`.
