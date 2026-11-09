"""Builds a Create ML object detection dataset for ToteTrack from LVIS v1 (CC BY 4.0) and COCO 2017 images.

Usage: python3 prepare_lvis.py LVIS_TRAIN_JSON_ZIP OUT_DIR [--per-class 120] [--test-share 0.1]

Writes OUT_DIR/train and OUT_DIR/test, each with resized JPEGs and an annotations.json in Create ML's format:
[{"image": "123.jpg", "annotations": [{"label": "Hammer", "coordinates": {"x": cx, "y": cy, "width": w, "height": h}}]}]
Coordinates are pixels in the resized image, centered, origin top left. Also writes OUT_DIR/classes.json with
the labels kept and how many boxes each has.
"""

import argparse
import io
import json
import os
import random
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import ijson
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_SIDE = 512  # images are shrunk to this; plenty for a phone photo of a tote and much faster to train
MIN_BOX = 0.04  # a box must be at least 4% of the image's width and height to count
MIN_IMAGES = 25  # a label needs this many images or it's dropped


def norm(s: str) -> str:
    s = re.sub(r"\(.*?\)", " ", s.lower()).replace("_", " ").replace("-", " ")
    return re.sub(r"\s+", " ", s).strip()


def load_classes():
    labels = {}
    for line in open(os.path.join(HERE, "classes.txt")):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, syns = line.split(":", 1)
        for s in syns.split(","):
            if s.strip():
                labels.setdefault(norm(s), name.strip())
    return labels


def json_member(zip_path):
    z = zipfile.ZipFile(zip_path)
    name = next(n for n in z.namelist() if n.endswith(".json"))
    return z.open(name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lvis_zip")
    ap.add_argument("out")
    ap.add_argument("--per-class", type=int, default=120)
    ap.add_argument("--test-share", type=float, default=0.1)
    args = ap.parse_args()
    random.seed(7)

    wanted = load_classes()

    # Pass 1: categories. Each LVIS category maps to one of our labels by its name or any synonym.
    cat_label = {}
    with json_member(args.lvis_zip) as f:
        for c in ijson.items(f, "categories.item"):
            names = [c["name"], *c.get("synonyms", [])]
            for n in names:
                label = wanted.get(norm(n))
                if label:
                    cat_label[c["id"]] = label
                    print(f"  {c['name']} ({c.get('frequency')}, {c.get('image_count')} images) -> {label}")
                    break
    missing = sorted(set(wanted.values()) - set(cat_label.values()))
    print(f"{len(cat_label)} LVIS categories matched; labels with no match: {missing}")

    # Pass 2: images (size and download URL).
    images = {}
    with json_member(args.lvis_zip) as f:
        for im in ijson.items(f, "images.item"):
            images[im["id"]] = (im["coco_url"], im["width"], im["height"])

    # Pass 3: boxes for our categories that are big enough to learn from.
    boxes = defaultdict(list)  # image id -> [(label, x, y, w, h)]
    with json_member(args.lvis_zip) as f:
        for a in ijson.items(f, "annotations.item"):
            label = cat_label.get(a["category_id"])
            if not label:
                continue
            _, iw, ih = images[a["image_id"]]
            x, y, w, h = (float(v) for v in a["bbox"])
            if w < iw * MIN_BOX or h < ih * MIN_BOX:
                continue
            boxes[a["image_id"]].append((label, x, y, w, h))

    # Pick images: rarest labels first, preferring images with several of our items in them.
    by_label = defaultdict(list)
    for img, bs in boxes.items():
        for label in {b[0] for b in bs}:
            by_label[label].append(img)
    chosen, count = set(), defaultdict(int)
    for label in sorted(by_label, key=lambda l: len(by_label[l])):
        imgs = by_label[label]
        random.shuffle(imgs)
        imgs.sort(key=lambda i: -len({b[0] for b in boxes[i]}))
        for img in imgs:
            if count[label] >= args.per_class:
                break
            if img in chosen:
                continue
            chosen.add(img)
            for l in {b[0] for b in boxes[img]}:
                count[l] += 1
    keep = {l for l, n in count.items() if n >= MIN_IMAGES}
    print(f"{len(chosen)} images chosen; {len(keep)} labels kept; dropped for too few images: "
          f"{sorted(set(by_label) - keep)}")

    chosen = sorted(chosen)
    random.shuffle(chosen)
    n_test = int(len(chosen) * args.test_share)
    splits = {"test": chosen[:n_test], "train": chosen[n_test:]}

    def fetch(split, img):
        url, iw, ih = images[img]
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = r.read()
            im = Image.open(io.BytesIO(data)).convert("RGB")
        except Exception as e:  # a few missing images shouldn't stop the run
            print(f"  skip {url}: {e}", file=sys.stderr)
            return None
        scale = min(1.0, MAX_SIDE / max(im.width, im.height))
        if scale < 1:
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        sx, sy = im.width / iw, im.height / ih
        name = f"{img}.jpg"
        im.save(os.path.join(args.out, split, name), quality=88)
        anns = [
            {"label": l, "coordinates": {"x": round((x + w / 2) * sx, 1), "y": round((y + h / 2) * sy, 1),
                                         "width": round(w * sx, 1), "height": round(h * sy, 1)}}
            for (l, x, y, w, h) in boxes[img] if l in keep
        ]
        return {"image": name, "annotations": anns} if anns else None

    totals = defaultdict(int)
    for split, imgs in splits.items():
        os.makedirs(os.path.join(args.out, split), exist_ok=True)
        with ThreadPoolExecutor(32) as pool:
            rows = [r for r in pool.map(lambda i: fetch(split, i), imgs) if r]
        for r in rows:
            for a in r["annotations"]:
                totals[a["label"]] += 1
        json.dump(rows, open(os.path.join(args.out, split, "annotations.json"), "w"))
        print(f"{split}: {len(rows)} images")

    json.dump(dict(sorted(totals.items())), open(os.path.join(args.out, "classes.json"), "w"), indent=1)
    for l, n in sorted(totals.items(), key=lambda kv: -kv[1]):
        print(f"  {l}: {n} boxes")


if __name__ == "__main__":
    main()
