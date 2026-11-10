"""Adds Open Images V7 boxes (annotations CC BY 4.0, images CC BY 2.0) to a dataset made by prepare_lvis.py.

Usage: python3 prepare_openimages.py BOXES_CSV CLASSES_CSV OUT_DIR [--per-class 150] [--min-images 15]

BOXES_CSV is oidv6-train-annotations-bbox.csv and CLASSES_CSV oidv7-class-descriptions-boxable.csv. Open Images
class names are matched to classes.txt the same way as LVIS. Up to --per-class images are added for each label,
then labels with fewer than --min-images images in the whole dataset are dropped.
"""

import argparse
import csv
import io
import json
import os
import random
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prepare_lvis import MAX_SIDE, MIN_BOX, load_classes, norm

URL = os.environ.get("OI_URL", "https://open-images-dataset.s3.amazonaws.com/train/{}.jpg")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("boxes")
    ap.add_argument("classes")
    ap.add_argument("out")
    ap.add_argument("--per-class", type=int, default=150)
    ap.add_argument("--min-images", type=int, default=15)
    ap.add_argument("--test-share", type=float, default=0.1)
    args = ap.parse_args()
    random.seed(11)

    wanted = load_classes()
    mid_label = {}
    for row in csv.reader(open(args.classes)):
        if len(row) == 2 and wanted.get(norm(row[1])):
            mid_label[row[0]] = wanted[norm(row[1])]
            print(f"  {row[1]} -> {mid_label[row[0]]}")
    print(f"{len(mid_label)} Open Images classes matched")

    # Boxes for our labels; drawings and tiny boxes are skipped. Coordinates are 0..1.
    boxes = defaultdict(list)
    with open(args.boxes, newline="") as f:
        r = csv.reader(f)
        h = next(r)
        col = {k: h.index(k) for k in ("ImageID", "LabelName", "XMin", "XMax", "YMin", "YMax", "IsDepiction")}
        for row in r:
            label = mid_label.get(row[col["LabelName"]])
            if not label or row[col["IsDepiction"]] == "1":
                continue
            x0, x1, y0, y1 = (float(row[col[k]]) for k in ("XMin", "XMax", "YMin", "YMax"))
            if x1 - x0 < MIN_BOX or y1 - y0 < MIN_BOX:
                continue
            boxes[row[col["ImageID"]]].append((label, x0, y0, x1 - x0, y1 - y0))

    by_label = defaultdict(list)
    for img, bs in boxes.items():
        for label in {b[0] for b in bs}:
            by_label[label].append(img)
    chosen, count = set(), defaultdict(int)
    for label in sorted(by_label, key=lambda l: len(by_label[l])):
        imgs = by_label[label]
        random.shuffle(imgs)
        for img in imgs:
            if count[label] >= args.per_class:
                break
            if img in chosen:
                continue
            chosen.add(img)
            for l in {b[0] for b in boxes[img]}:
                count[l] += 1
    chosen = sorted(chosen)
    random.shuffle(chosen)
    n_test = int(len(chosen) * args.test_share)
    print(f"{len(chosen)} Open Images photos chosen")

    def fetch(split, img):
        try:
            with urllib.request.urlopen(URL.format(img), timeout=60) as r:
                im = Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception as e:
            print(f"  skip {img}: {e}", file=sys.stderr)
            return None
        scale = min(1.0, MAX_SIDE / max(im.width, im.height))
        if scale < 1:
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        name = f"oi_{img}.jpg"
        im.save(os.path.join(args.out, split, name), quality=88)
        W, H = im.width, im.height
        return {"image": name, "annotations": [
            {"label": l, "coordinates": {"x": round((x + w / 2) * W, 1), "y": round((y + h / 2) * H, 1),
                                         "width": round(w * W, 1), "height": round(h * H, 1)}}
            for (l, x, y, w, h) in boxes[img]]}

    rows = {}
    for split, imgs in (("test", chosen[:n_test]), ("train", chosen[n_test:])):
        path = os.path.join(args.out, split, "annotations.json")
        rows[split] = json.load(open(path)) if os.path.exists(path) else []
        os.makedirs(os.path.join(args.out, split), exist_ok=True)
        with ThreadPoolExecutor(48) as pool:
            rows[split] += [r for r in pool.map(lambda i: fetch(split, i), imgs) if r]

    # Drop labels that still have too few photos, across both sources.
    images_per_label = defaultdict(int)
    for split in rows:
        for r in rows[split]:
            for l in {a["label"] for a in r["annotations"]}:
                images_per_label[l] += 1
    keep = {l for l, n in images_per_label.items() if n >= args.min_images}
    print(f"dropped for too few photos: {sorted(set(images_per_label) - keep)}")

    totals = defaultdict(int)
    for split, rs in rows.items():
        out = []
        for r in rs:
            anns = [a for a in r["annotations"] if a["label"] in keep]
            if anns:
                out.append({"image": r["image"], "annotations": anns})
                for a in anns:
                    totals[a["label"]] += 1
            else:
                os.remove(os.path.join(args.out, split, r["image"]))
        json.dump(out, open(os.path.join(args.out, split, "annotations.json"), "w"))
        print(f"{split}: {len(out)} photos")
    json.dump(dict(sorted(totals.items())), open(os.path.join(args.out, "classes.json"), "w"), indent=1)
    print(f"{len(totals)} item types:")
    for l, n in sorted(totals.items(), key=lambda kv: -kv[1]):
        print(f"  {l}: {n} boxes")


if __name__ == "__main__":
    main()
